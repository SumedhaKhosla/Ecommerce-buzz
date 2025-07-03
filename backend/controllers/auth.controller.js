import User from "../models/user.model.js";
import {redis} from "../lib/redis.js";
import jwt from "jsonwebtoken";

//helper function to generate tokens
const generateTokens = (userId) => {
    const accessToken = jwt.sign({userId}, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "15m", //short-lived token for requests
    });

    const refreshToken = jwt.sign({userId}, process.env.REFRESH_TOKEN_SECRET, {
        expiresIn: "7d", //long-lived token to refresh accessToken
    });

    return {accessToken, refreshToken};
};

//save the refresh token in Redis with an expiration of 7 days
const storeRefreshToken = async(userId, refreshToken) => {
    await redis.set(`refresh_token:${userId}`, refreshToken, "EX", 7*24*60*60);
};

//Store tokens in browser cookies for secure communication
const setCookies = (res, accessToken, refreshToken) => {
    res.cookie("accessToken", accessToken, {
        httpOnly: true, //prevent attacks, not accessible by javascript(prevent XSS)
        secure: process.env.NODE_ENV === "production", //only sent over HTTPS in production
        sameSite: "strict", //prevents attack
        maxAge: 15* 60* 1000,
    });

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true, //prevent attacks, cross site scripting attack
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict", //prevents attack
        maxAge: 7* 24* 60* 60* 1000,
    });
};

//signup controller
export const signup = async (req, res) => {
    const {email, password, name} = req.body
    try {
        //checks if user exist or not
        const userExists = await User.findOne({ email});
    if(userExists) {
        return res.status(400).json({message: "User already exists"});
    }

    //create new user
    const user = await User.create({name, email, password}) 

    //authentication: generate tokens in Redis
    const {accessToken, refreshToken} = generateTokens(user._id);
    await storeRefreshToken(user._id, refreshToken);

    setCookies(res, accessToken, refreshToken);

    //send user data(excluding password) in response
    res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
    });
    } catch (error) {
        console.log("Error in signup controller", error.message);
        res.status(500).json({message: error.message});
    }
    
};

//login controller
export const login = async (req, res) => {
    try {
        const {email, password} = req.body;
        //find user by email
        const user = await User.findOne({email});

        //compare entered password with hashed password in DB
        if(user && (await user.comparePassword(password))) {

            //if valid, generate and store new tokens
            const {accessToken, refreshToken} = generateTokens(user._id);
            await storeRefreshToken(user._id, refreshToken);
            setCookies(res, accessToken, refreshToken);

            //send user data in response
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            });
        }
        else {
            res.status(401).json({message: "Invalid email or password"});
        }
    } catch (error) {
        console.log("Error in login controller", error.message);
        res.status(500).json({message: error.message});
        
    }
};

//logout controller
export const logout = async (req, res) => {
	try {
		const refreshToken = req.cookies.refreshToken;

        //if refresh token exists in cookies, decode and delete in from Reddis
		if (refreshToken) {
			const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
			const result = await redis.del(`refresh_token:${decoded.userId}`);
            console.log("Redis DEL result:", result); //1 if deleted, 0 if not deleted used for debugging

		}

        //clear both access and refresh token
		res.clearCookie("accessToken");
		res.clearCookie("refreshToken");

		res.json({ message: "Logged out successfully" });

	} catch (error) {
		console.log("Error in logout controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

//this will refresh the access token
export const refreshToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        // No token in cookies
        if (!refreshToken) {
            return res.status(401).json({ message: "No refresh token provided" });
        }

        // Verify token and decode userId
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        const storedToken = await redis.get(`refresh_token:${decoded.userId}`);

        // If stored token doesn't match what's in cookies, reject
        if (storedToken !== refreshToken) {
            return res.status(401).json({ message: "Invalid refresh token" });
        }

        // Generate a new access token
        const accessToken = jwt.sign({ userId: decoded.userId }, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: "15m"
        });

        // Set the new access token as a cookie
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000
        });

        res.json({ message: "Token refreshed successfully" });

    } catch (error) {
        console.log("Error in refreshToken controller", error.message);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const getProfile = async (req, res) => {
	try {
		res.json(req.user);
	} catch (error) {
		res.status(500).json({ message: "Server error", error: error.message });
	}
};