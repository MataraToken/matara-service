import mongoose from "mongoose";

const milestoneSchema = new mongoose.Schema(
  {
    count: {
      type: String,
      required: true,
      default: 5
    },
    points: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

const Milestone = mongoose.model("Milestone", milestoneSchema);

export default Milestone;
