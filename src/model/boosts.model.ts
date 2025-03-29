import mongoose from "mongoose";

const boostSchema = new mongoose.Schema(
  {
    count: {
      type: Number,
      required: true,
      default: 2
    },
    points: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

const Boosts = mongoose.model("Boost", boostSchema);

export default Boosts;
