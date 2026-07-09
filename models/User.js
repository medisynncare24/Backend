import mongoose from "mongoose";

// Field names kept close to the old MySQL columns (full_name, reset_otp, otp_expiry, profile_image)
// so the rest of the route logic barely has to change.
const userSchema = new mongoose.Schema(
  {
    full_name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // bcrypt hash

    reset_otp: { type: String, default: null },
    otp_expiry: { type: Date, default: null },

    profile_image: { type: String, default: null }, // just the filename, same as before
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);