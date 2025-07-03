import mongoose from "mongoose";
import bcrypt from "bcryptjs"

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Name is required"]
    },

    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true, //no two users can have same email
        lowercase: true, //converts to lowercase automatically
        trim: true //removes spaces before/after email
    },

    password: {
        type: String, 
        required: [true, "Password is required"],
        minlength: [6, "Password must be at least 6 characters long"]
    },

    cartItems: [{
            quantity:{
                type:Number,
                default: 1
            },

            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product"
            }
    }],
    
    role: {
        type: String,
        enum: ["customer", "admin"], //only allowed values
        default: "customer"
    }
}, {
    timestamps: true, //automatically adds createdAt and updatedAt fields to each user document
});



//pre-save hook to hash user's password before saving it to the database
userSchema.pre("save", async function (next) {
    if(!this.isModified("password")) return next();  //prevents re-hashing an already hashed password during updates
    
    try {
        const salt = await bcrypt.genSalt(10); //10 is cost factor(higher = more secure but slower)
        this.password = await bcrypt.hash(this.password, salt);
        next()
    } catch(error) {
        next(error)
    }
})

//will check for the wrong passwords -- invalid credentials
userSchema.methods.comparePassword = async function (password) {
    return bcrypt.compare(password, this.password);
}

const User = mongoose.model("User", userSchema);

export default User;