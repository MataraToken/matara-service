import mongoose from "mongoose";

const pointsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    points: {
      type: Number,
      default: 20,
    },
    energy: {
      type: Number,
      default: 500,
    },
    energyStamp: {
      type: Date,
      default: Date.now,
    },
    lastTapTime: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Point = mongoose.model("Point", pointsSchema);

export default Point;
