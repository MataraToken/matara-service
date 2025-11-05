import mongoose from "mongoose";

const taskSubmissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    proofUrl: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["non-started", "reviewing", "complete", "rejected"],
      default: "non-started",
    },
    reviewedBy: {
      type: String, // Admin username
    },
    reviewedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
    },
  },
  { timestamps: true }
);

// Create compound index to ensure one submission per user-task combination
taskSubmissionSchema.index({ userId: 1, taskId: 1 }, { unique: true });

const TaskSubmission = mongoose.model("TaskSubmission", taskSubmissionSchema);

export default TaskSubmission;

