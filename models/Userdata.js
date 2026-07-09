import mongoose from "mongoose";

// Mongo stores arrays natively, so no more JSON.stringify/parse or safeParse() needed —
// heartRateHistory etc. are just plain arrays now.
const userDataSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    heartRateHistory: { type: Array, default: [] },
    stepsHistory: { type: Array, default: [] },
    bpHistory: { type: Array, default: [] },
    healthHistory: { type: Array, default: [] },
    wellnessTips: { type: Array, default: [] },
    reminders: { type: Array, default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("UserData", userDataSchema);