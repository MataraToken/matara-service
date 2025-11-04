import mongoose from "mongoose";

const socialSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    icon: {
      type: Object,
      url: {
        type: String,
      },
      public_id: {
        type: String,
      },
    },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    logo: {
      type: Object,
      url: {
        type: String,
      },
      public_id: {
        type: String,
      },
    },
    description: {
      type: String,
      required: true,
    },
    socials: {
      type: [socialSchema],
      default: [],
    },
    numberOfParticipants: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["in-progress", "completed"],
      default: "in-progress",
    },
    joinedUsers: [
      {
        type: String,
      },
    ],
  },
  { timestamps: true }
);

const Project = mongoose.model("Project", projectSchema);

export default Project;

