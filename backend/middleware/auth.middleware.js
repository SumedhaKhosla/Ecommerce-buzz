import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

//Middleware to protect routes - only accessible with valid access token
export const protectRoute = async (req, res, next) => {
    try {

        //1. Get access token from cookies
        const accessToken = req.cookies.accessToken;

        //2. if no token, block access
        if(!accessToken) {
            return res.status(401).json({message: "Unauthorized - No access token provided"});
        }

        try {
            //3. Verify access token
            const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);

            //4. Fetch the user from DB using decoded userId, exclude password
            const user = await User.findById(decoded.userId).select("-password");

            //5. if user not found, block access
            if(!user) {
                return res.status(401).json({message: "User not found"});
            }

            //6. Attach user info to request so route handlers can use it
            req.user = user;

            //7. Pass control to the next middleware or route handler
            next()
        } catch (error) {

            //8. if token is expired, respond accordingly
            if(error.name === "TokenExpiredError") {
                return res.status(401).json({message: "Unauthorized - Access token expired"});
            }

            //9. for other errors
            throw error;    
        }

    } catch (error) {
        
        console.log("Error in protectRoute middleware", error.message);
        return res.status(401).json({message : "Unauthorized- Invalid access token"});
    }
};


//Middleware to allow access to only admin users
export const adminRoute = (req, res, next) => {
    //Check if user is logged in AND has admin role
    if(req.user && req.user.role === "admin") {
       next();  //allow request to proceed
    }
    else {
        return res.status(401).json({messae: "Access denied - Admin only"});
    }
};