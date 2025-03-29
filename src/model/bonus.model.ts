import mongoose from "mongoose";

const bonusSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now, // Set the default to the current time
      required: true,
    },
    loginStreak: {
      type: Number,
      default: 0, // Default streak starts at 0
    },
    bonusCollected: {
      type: Boolean,
      default: false, // Default bonus collected is false
    },
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt fields
  }
);

const Bonuses = mongoose.model("Bonus", bonusSchema);

export default Bonuses;
