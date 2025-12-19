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
  },
  { timestamps: true }
);

module.exports = model("Election", electionSchema);
