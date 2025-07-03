import Product from "../models/product.model.js";
import {redis} from "../lib/redis.js";
import cloudinary from "../lib/cloudinary.js";

//Get all products from the database
export const getAllProducts = async (req, res) => {
    try {
       const products = await Product.find({}); //fetch all the products
       res.json({products});
    } catch (error) {

        console.log("Error in getAllProducts controller", error.message);
        res.status(500).json({message: "Server error", error: error.message});
        
    }
};

//get featured products using redis cache
export const getFeaturedProducts = async (req, res) => {
    try {
        //check if the data is in redis cache
        let featuredProducts = await redis.get("featured_products");

        //if found in cache,parse and return it
        if(featuredProducts) {
            return res.json(JSON.parse(featuredProducts));
        }
        
        //if not found in cache, fetch it from database mongodb
        featuredProducts = await Product.find({isFeatured: true}).lean();
        if(!featuredProducts) {
            return res.status(404).json({message: "No featured products found"});
        }

        //save fetched data in the redis for future use
        await redis.set("featured_products", JSON.stringify(featuredProducts));

        //send the response
        res.json(featuredProducts);
    } catch (error) {
        console.log("Error in getFeaturedProducts controller", error.message);
        res.status(500).json({message: "Server error", error: error.message});
    }
};

// create a new product with image upload to cloudinary
export const createProduct = async (req, res) => {
    try {
        const {name, description, price, image, category} = req.body;

        let cloudinaryResponse = null;

        //if image is provided, upload it to cloudinary
        if(image) {
            cloudinaryResponse = await cloudinary.uploader.upload(image, {folder: "products"});
        }

        //create product in the mongodb
        const product = await Product.create({
            name, 
            description,
            price,
            image: cloudinaryResponse?.secure_url ? cloudinaryResponse.secure_url : "",
            category
        });

        res.status(201).json(product);
    } catch (error) {

        console.log("Error in createProduct controller", error.message);
        res.status(500).json({message : "Server error", error: error.message });   
    }
};

export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if(!product) {
            return res.status(404).json({message: "Product not found"});
        }

        let publicId = null;
        if(product.image) {
            publicId = product.image.split("/").pop().split(".")[0];
        }

        try {
            await cloudinary.uploader.destroy(`products/${publicId}`);
            console.log("Deleted image from the cloudinary");
        } catch (error) {
            console.log("Error in deleting image from cloudinary", error);
        }

        await Product.findByIdAndDelete(req.params.id);
    } catch (error) {
        
        console.log("Error in deleteProduct controller", error.message);
        res.status(500).json({message : "Server error", error: error.message });   

    }
};

export const getRecommendedProducts = async (req, res) => {
    try {
        const products = await Product.aggregate([
            {
                $sample: {size:3}
            },

            {
                $project: {
                    _id:1,
                    name:1,
                    description:1,
                    image:1,
                    price:1
                }
            }
    ])

    res.json(products);
    } catch (error) {
        console.log("Error in getRecommendedProducts controller", error.message);
        res.status(500).json({message : "Server error", error: error.message });
    }
};

export const getProductsByCategory = async (req, res) => {
    const {category} = req.params;

    try {
        const products = await Product.find({category});
        res.json({products});

    } catch (error) {
        console.log("Error in getProductsByCategory controller", error.message);
        res.status(500).json({message : "Server error", error: error.message });
        
    }
};

export const toggleFeaturedProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if(product) {
            product.isFeatured = !product.isFeatured;
            const updatedProduct = await product.save();
            await updateFeaturedProductCache();
            res.json(updatedProduct);
        }
    } catch (error) {
        console.log("Error in toggleFeaturedProduct controller", error.message);
        res.status(500).json({message : "Server error", error: error.message });
    }
};

async function updateFeaturedProductCache() {
    try {
        const featuredProducts = await Product.find({isFeatured:true}).lean();
        await redis.set("featured_products", JSON.stringify(featuredProducts));
    } catch (error) {
        console.log("Error in update cache function");
    }
}
