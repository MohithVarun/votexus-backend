const { v4: uuid } = require("uuid");
const cloudinary = require("../utils/cloudinary");

const HttpError = require("../models/ErrorModel");
const ElectionModel = require("../models/electionModel");
const CandidateModel = require("../models/candidateModel");

/* ================= ADD ELECTION ================= */
// POST : api/elections (Admin only)
const addElection = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) {
      return next(new HttpError("Only an admin can perform this action.", 403));
    }

    const { title, description } = req.body;
    if (!title || !description) {
      return next(new HttpError("Fill all fields.", 422));
    }

    if (!req.files || !req.files.club) {
      return next(new HttpError("Choose a club image.", 422));
    }

    const club = req.files.club;

    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(club.mimetype)) {
      return next(
        new HttpError("Only JPG, PNG or WEBP images allowed", 422)
      );
    }

    if (club.size > 1000000) {
      return next(
        new HttpError("Image size must be less than 1MB", 422)
      );
    }

    let uploadResult;
    try {
      uploadResult = await cloudinary.uploader.upload(
        club.tempFilePath,
        {
          folder: "votexus/elections",
          public_id: uuid(),
          resource_type: "image",
        }
      );
    } catch (err) {
      return next(new HttpError("Image upload failed", 500));
    }

    const newElection = await ElectionModel.create({
      title,
      description,
      club: uploadResult.secure_url,
      cloudinaryId: uploadResult.public_id,
    });

    res.status(201).json(newElection);
  } catch (error) {
    return next(
      new HttpError(error.message || "Failed to add election", 500)
    );
  }
};

/* ================= GET ALL ELECTIONS ================= */
const getElections = async (req, res, next) => {
  try {
    const elections = await ElectionModel.find({ isDeleted: false });
    res.status(200).json(elections);
  } catch (error) {
    return next(new HttpError(error));
  }
};

/* ================= GET SINGLE ELECTION ================= */
const getElection = async (req, res, next) => {
  try {
    const election = await ElectionModel.findOne({
      _id: req.params.id,
      isDeleted: false,
    });

    if (!election) {
      return next(new HttpError("Election not found", 404));
    }

    res.status(200).json(election);
  } catch (error) {
    return next(new HttpError(error));
  }
};

/* ================= GET CANDIDATES OF ELECTION ================= */
const getCandidatesOfElection = async (req, res, next) => {
  try {
    const candidates = await CandidateModel.find({
      election: req.params.id,
    });
    res.status(200).json(candidates);
  } catch (error) {
    return next(new HttpError(error));
  }
};

/* ================= GET VOTERS OF ELECTION ================= */
const getElectionVoters = async (req, res, next) => {
  try {
    const election = await ElectionModel.findById(req.params.id).populate(
      "voters"
    );

    if (!election || election.isDeleted) {
      return next(new HttpError("Election not found", 404));
    }

    res.status(200).json(election.voters);
  } catch (error) {
    return next(new HttpError(error));
  }
};

/* ================= UPDATE ELECTION ================= */
// PATCH : api/elections/:id (Admin only)
const updateElection = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) {
      return next(new HttpError("Only an admin can perform this action.", 403));
    }

    const { title, description } = req.body;
    if (!title || !description) {
      return next(new HttpError("Fill all fields.", 422));
    }

    const election = await ElectionModel.findById(req.params.id);
    if (!election || election.isDeleted) {
      return next(new HttpError("Election not found", 404));
    }

    const updatedData = { title, description };

    if (req.files && req.files.club) {
      const club = req.files.club;

      const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
      if (!allowedTypes.includes(club.mimetype)) {
        return next(
          new HttpError("Only JPG, PNG or WEBP images allowed", 422)
        );
      }

      if (club.size > 1000000) {
        return next(
          new HttpError("Image size must be less than 1MB", 422)
        );
      }

      try {
        if (election.cloudinaryId) {
          await cloudinary.uploader.destroy(election.cloudinaryId);
        }

        const uploadResult = await cloudinary.uploader.upload(
          club.tempFilePath,
          {
            folder: "votexus/elections",
            public_id: uuid(),
            resource_type: "image",
          }
        );

        updatedData.club = uploadResult.secure_url;
        updatedData.cloudinaryId = uploadResult.public_id;
      } catch (err) {
        return next(new HttpError("Image update failed", 500));
      }
    }

    await ElectionModel.findByIdAndUpdate(req.params.id, updatedData);
    res.status(200).json({ message: "Election updated successfully" });
  } catch (error) {
    return next(
      new HttpError(error.message || "Failed to update election", 500)
    );
  }
};

/* ================= DELETE ELECTION (SOFT DELETE) ================= */
// DELETE : api/elections/:id (Admin only)
const removeElection = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) {
      return next(new HttpError("Only an admin can perform this action.", 403));
    }

    const election = await ElectionModel.findById(req.params.id);
    if (!election || election.isDeleted) {
      return next(new HttpError("Election not found", 404));
    }

    // 🔥 Cascade delete candidate images
    const candidates = await CandidateModel.find({
      election: election._id,
    });

    for (const candidate of candidates) {
      if (candidate.cloudinaryId) {
        try {
          await cloudinary.uploader.destroy(candidate.cloudinaryId);
        } catch (err) {
          console.error("Failed to delete candidate image:", err);
        }
      }
    }

    await CandidateModel.deleteMany({ election: election._id });

    election.isDeleted = true;
    await election.save();

    res.status(200).json("Election deleted successfully.");
  } catch (error) {
    return next(new HttpError(error));
  }
};

module.exports = {
  addElection,
  getElections,
  getElection,
  updateElection,
  removeElection,
  getCandidatesOfElection,
  getElectionVoters,
};
