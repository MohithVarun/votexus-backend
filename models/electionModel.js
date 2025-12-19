const { Schema, model, Types } = require("mongoose");

const electionSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    club: {
      type: String,
      required: true,
    },

    cloudinaryId: {
      type: String,
      required: true,
    },

    candidates: [
      {
        type: Types.ObjectId,
        ref: "Candidate",
      },
    ],

    voters: [
      {
        type: Types.ObjectId,
        ref: "Voter",
      },
    ],

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

/* ---------- INDEXES (PERFORMANCE) ---------- */
electionSchema.index({ isDeleted: 1 });

module.exports = model("Election", electionSchema);
