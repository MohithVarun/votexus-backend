const { v4: uuid } = require("uuid");
const cloudinary = require("../utils/cloudinary");
const mongoose = require("mongoose");

const HttpError = require("../models/ErrorModel");
const ElectionModel = require("../models/electionModel");
const CandidateModel = require("../models/candidateModel");
const VoterModel = require("../models/voterModel");

/* ================= ADD CANDIDATE ================= */
// POST : api/candidates (Admin only)
const addCandidate = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) {
      return next(new HttpError("Only an admin can perform this action.", 403));
    }

    const { fullName, motto, currentElection } = req.body;

    if (!fullName || !motto || !currentElection) {
      return next(new HttpError("Fill all fields", 422));
    }

    if (!req.files || !req.files.image) {
      return next(new HttpError("Choose an image.", 422));
    }

    const image = req.files.image;

    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(image.mimetype)) {
      return next(
        new HttpError("Only JPG, PNG or WEBP images allowed", 422)
      );
    }

    if (image.size > 1000000) {
      return next(
        new HttpError("Image size must be less than 1MB", 422)
      );
    }

    const election = await ElectionModel.findById(currentElection);
    if (!election || election.isDeleted) {
      return next(new HttpError("Election not found", 404));
    }

    let uploadResult;
    try {
      uploadResult = await cloudinary.uploader.upload(
        image.tempFilePath,
        {
          folder: "votexus/candidates",
          public_id: uuid(),
          resource_type: "image",
        }
      );
    } catch (err) {
      return next(new HttpError("Image upload failed", 500));
    }

    let newCandidate;

    try {
      const sess = await mongoose.startSession();
      sess.startTransaction();

      newCandidate = await CandidateModel.create(
        [
          {
            fullName,
            motto,
            image: uploadResult.secure_url,
            cloudinaryId: uploadResult.public_id,
            election: election._id,
          },
        ],
        { session: sess }
      );

      newCandidate = newCandidate[0];
      election.candidates.push(newCandidate._id);
      await election.save({ session: sess });

      await sess.commitTransaction();
      await sess.endSession();
    } catch (err) {
      if (err.message && err.message.includes("replica set")) {
        newCandidate = await CandidateModel.create({
          fullName,
          motto,
          image: uploadResult.secure_url,
          cloudinaryId: uploadResult.public_id,
          election: election._id,
        });

        election.candidates.push(newCandidate._id);
        await election.save();
      } else {
        throw err;
      }
    }

    res.status(201).json({
      message: "Candidate added successfully",
      candidate: newCandidate,
    });
  } catch (error) {
    return next(
      new HttpError(error.message || "Failed to add candidate", 500)
    );
  }
};

/* ================= GET SINGLE CANDIDATE ================= */
const getCandidate = async (req, res, next) => {
  try {
    const candidate = await CandidateModel.findById(req.params.id);
    if (!candidate) {
      return next(new HttpError("Candidate not found", 404));
    }
    res.status(200).json(candidate);
  } catch (error) {
    return next(new HttpError(error));
  }
};

/* ================= DELETE CANDIDATE ================= */
// DELETE : api/candidates/:id (Admin only)
const removeCandidate = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) {
      return next(new HttpError("Only an admin can perform this action.", 403));
    }

    const candidate = await CandidateModel.findById(req.params.id).populate(
      "election"
    );

    if (!candidate) {
      return next(new HttpError("Candidate not found", 404));
    }

    // Delete image from Cloudinary
    if (candidate.cloudinaryId) {
      try {
        await cloudinary.uploader.destroy(candidate.cloudinaryId);
      } catch (err) {
        console.error("Cloudinary delete failed:", err);
      }
    }

    candidate.election.candidates.pull(candidate._id);
    await candidate.election.save();
    await candidate.deleteOne();

    res.status(200).json("Candidate deleted successfully.");
  } catch (error) {
    return next(new HttpError(error));
  }
};

/* ================= VOTE CANDIDATE ================= */
// PATCH : api/candidates/:id
const voteCandidate = async (req, res, next) => {
  try {
    const candidateId = req.params.id;
    const { selectedElection } = req.body;

    const voter = await VoterModel.findById(req.user.id);
    if (!voter) {
      return next(new HttpError("Voter not found", 404));
    }

    const hasVoted = voter.votedElections.some(
      e => (e._id || e).toString() === selectedElection
    );

    if (hasVoted) {
      return next(
        new HttpError("You have already voted in this election", 403)
      );
    }

    const election = await ElectionModel.findById(selectedElection);
    if (!election || election.isDeleted) {
      return next(new HttpError("Election not found", 404));
    }

    const candidate = await CandidateModel.findById(candidateId);
    if (!candidate) {
      return next(new HttpError("Candidate not found", 404));
    }

    if (candidate.election.toString() !== selectedElection) {
      return next(
        new HttpError("Candidate does not belong to this election", 400)
      );
    }

    candidate.voteCount += 1;
    voter.votedElections.push(election._id);
    election.voters.push(voter._id);

    await candidate.save();
    await voter.save();
    await election.save();

    res.status(200).json(voter.votedElections);
  } catch (error) {
    return next(
      new HttpError(error.message || "Failed to process vote", 500)
    );
  }
};

module.exports = {
  addCandidate,
  getCandidate,
  removeCandidate,
  voteCandidate,
};
