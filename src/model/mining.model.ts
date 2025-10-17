import mongoose from "mongoose";

const miningSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  miningStartedAt: { type: Date, default: null },
  lastClaimedAt: { type: Date, default: null },
  isMining: { type: Boolean, default: false },
  sessionPoints: {type: Number, default: 0}
});

const Mining = mongoose.model("Mining", miningSchema);

export default Mining;
