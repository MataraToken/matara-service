import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
    },
    level: {
      type: Number,
      default: 1,
    },
    currentTapCount: {
      type: Number,
      default: 1,
    },
    maxPoints: {
      type: Number,
      default: 500,
    },
    premium: {
      type: Boolean,
      default: false,
    },
    profilePicture: {
      type: String,
    },
    referrals: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    referralCode: {
      type: String,
    },
    onboarding: {
      type: Boolean,
      default: false,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    autoTapEndTime: { type: Date, default: null },
    autoTapPaused: { type: Boolean, default: false },
    tasksCompleted: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
      },
    ],
    milestonesCompleted: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Milestone",
      },
    ],
    // loginStreak: {
    //   type: Number,
    //   default: 0,
    // },
    // lastLogin: {
    //   type: Date,
    //   default: Date.now,
    // },
    userBoosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Boost",
      },
    ]
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
