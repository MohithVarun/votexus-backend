const { Schema, model, Types } = require("mongoose");

const candidateSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    image: {
      type: String,
      required: true,
    },

    cloudinaryId: {
      type: String,
      required: true,
    },

    motto: {
      type: String,
      required: true,
      trim: true,
    },

    voteCount: {
      type: Number,
      default: 0,
    },

    election: {
      type: Types.ObjectId,
      ref: "Election",
      required: true,
    },
  },
  { timestamps: true }
);

/* ---------- INDEXES (PERFORMANCE) ---------- */
candidateSchema.index({ election: 1 });
candidateSchema.index({ voteCount: -1 });

module.exports = model("Candidate", candidateSchema);
