const {v4:uuid}=require("uuid")
const cloudinary=require('../utils/cloudinary')
const path=require("path")
const mongoose=require("mongoose")

const HttpError=require('../models/ErrorModel')
const ElectionModal = require('../models/electionModel')
const CandidateModel = require('../models/candidateModel')
const VoterModel = require('../models/voterModel')
const electionModel = require("../models/electionModel")

//===========ADD CANDIDATE
//post :api/candidates
//protected (only admin)
const addCandidate = async (req,res,next)=>{
    try {
        //only admin can add election
        if(!req.user.isAdmin){
            return next(new HttpError("Only an admin can perform this action.",403))
        }
        const {fullName,motto,currentElection}=req.body;
        if(!fullName || !motto){
            return next(new HttpError("Fill in all fields",422))
        }
        if(!req.files.image){
            return next(new HttpError("Choose an image.",422))
        }

        const {image}=req.files;
        //check file size
        if(image.size >1000000){
            return next(new HttpError("Image size should be less than 1mb",422))
        }
        //rename the image
        let fileName=image.name;
        fileName=fileName.split(".")
        fileName=fileName[0] +uuid() +"."+fileName[fileName.length-1]
        const filePath = path.join(__dirname,'..','uploads',fileName)
        
        //upload file to uploads folder in project
        try {
            await new Promise((resolve, reject) => {
                image.mv(filePath, (err) => {
                    if(err) reject(err)
                    else resolve()
                })
            })
            
            //store image on cloudinary
            const result = await cloudinary.uploader.upload(filePath,{resource_type: "image"})
            if(!result.secure_url){
                return next(new HttpError("Couldn't upload image to cloudinary"))
            }
            
            //get election first to validate it exists
            let election = await ElectionModal.findById(currentElection)
            if(!election){
                return next(new HttpError("Election not found",404))
            }

            // Try to use transaction if MongoDB supports it (replica set), otherwise use sequential save
            let newCandidate;
            try {
                const sess = await mongoose.startSession()
                sess.startTransaction()
                
                // Create candidate within transaction
                newCandidate = await CandidateModel.create([{
                    fullName,
                    motto,
                    image: result.secure_url,
                    election: currentElection
                }], {session: sess})
                newCandidate = newCandidate[0] // create returns array
                
                election.candidates.push(newCandidate)
                await election.save({session: sess})
                
                await sess.commitTransaction()
                await sess.endSession()
            } catch (transactionError) {
                // If transaction fails (MongoDB is standalone, not replica set), use sequential save
                if(transactionError.message && transactionError.message.includes('replica set')){
                    // Create candidate without transaction
                    newCandidate = await CandidateModel.create({
                        fullName,
                        motto,
                        image: result.secure_url,
                        election: currentElection
                    })
                    election.candidates.push(newCandidate)
                    await election.save()
                } else {
                    // Some other transaction error, throw it
                    throw transactionError
                }
            }

            res.status(201).json({message: "Candidate added successfully", candidate: newCandidate})
        } catch (error) {
            return next(new HttpError(error.message || "Failed to add candidate", 500))
        }
    } catch (error) {
        return next(new HttpError(error))
    }
}



//===========GET CANDIDATE
//GET :api/candidates/:id
//protected 
const getCandidate = async (req,res,next)=>{
    try {
        const {id} = req.params;
        const candidate = await CandidateModel.findById(id)
        res.json(candidate)
    } catch (error) {
        return next(new HttpError(error))
    }
}

//===========delete CANDIDATE
//delete :api/candidates/:id
//protected (only admin)
const removeCandidate = async (req,res,next)=>{
    try {
        //only admin can add election
        if(!req.user.isAdmin){
            return next(new HttpError("Only an admin can perform this action.",403))
        }

        const {id} =req.params;
        let currentCandidate=await CandidateModel.findById(id).populate('election')
        if(!currentCandidate){
            return next(new HttpError("Couldn't delete candidate",422))
        } else{
            // Remove candidate from election (no transaction needed for standalone MongoDB)
            currentCandidate.election.candidates.pull(currentCandidate);
            await currentCandidate.election.save()
            await currentCandidate.deleteOne()

            res.status(200).json("Candidate deleted successfully.")
        }
    } catch (error) {
        return next(new HttpError(error))
    }
}

//===========VOTE CANDIDATE
//patch :api/candidates/:id
//protected
const voteCandidate = async (req,res,next)=>{
    try {
        const {id: candidateId}=req.params;
        const {selectedElection} =req.body;
        
        //get the current voter
        let voter = await VoterModel.findById(req.user.id)
        if(!voter){
            return next(new HttpError("Voter not found",404))
        }
        
        // CRITICAL: Check if voter has already voted in this election (prevent duplicate votes)
        // Handle both ObjectId and populated election references
        const hasVoted = voter.votedElections.some(election => {
            const electionId = election._id ? election._id.toString() : election.toString()
            return electionId === selectedElection
        })
        if(hasVoted){
            return next(new HttpError("You have already voted in this election",403))
        }
        
        //get selected election
        let election = await electionModel.findById(selectedElection);
        if(!election){
            return next(new HttpError("Election not found",404))
        }
        
        //get the candidate
        const candidate = await CandidateModel.findById(candidateId);
        if(!candidate){
            return next(new HttpError("Candidate not found",404))
        }
        
        // Verify candidate belongs to this election
        if(candidate.election.toString() !== selectedElection){
            return next(new HttpError("Candidate does not belong to this election",400))
        }
        
        // Try to use transaction if MongoDB supports it (replica set), otherwise use sequential saves
        let sessionUsed = false
        let sess = null
        try {
            sess = await mongoose.startSession()
            sess.startTransaction()
            sessionUsed = true
            
            // Increment candidate vote count
            const newVoteCount = candidate.voteCount + 1
            await CandidateModel.findByIdAndUpdate(candidateId, {voteCount: newVoteCount}, {session: sess, new: true})
            
            // Mark voter as voted
            voter.votedElections.push(election._id)
            await voter.save({session: sess})
            
            // Add voter to election
            election.voters.push(voter._id)
            await election.save({session: sess})
            
            await sess.commitTransaction()
            await sess.endSession()
            sessionUsed = false
            
        } catch (transactionError) {
            // Abort transaction if it was started
            if(sessionUsed && sess) {
                try {
                    await sess.abortTransaction()
                    await sess.endSession()
                } catch (abortError) {
                    // Log but don't fail on abort error
                    console.error("Error aborting transaction:", abortError)
                }
            }
            
            // If transaction fails (likely because MongoDB is standalone, not replica set)
            // Fall back to sequential operations with duplicate checks
            if(transactionError.message && transactionError.message.includes('replica set')){
                // Sequential save with additional validation
                // Check again if voter already voted (race condition protection)
                const updatedVoter = await VoterModel.findById(req.user.id)
                const hasVotedAgain = updatedVoter.votedElections.some(e => {
                    const electionId = e._id ? e._id.toString() : e.toString()
                    return electionId === selectedElection
                })
                if(hasVotedAgain){
                    return next(new HttpError("You have already voted in this election",403))
                }
                
                // Perform operations sequentially
                const newVoteCount = candidate.voteCount + 1
                await CandidateModel.findByIdAndUpdate(candidateId, {voteCount: newVoteCount})
                
                voter.votedElections.push(election._id)
                await voter.save()
                
                election.voters.push(voter._id)
                await election.save()
            } else {
                // Some other transaction error, throw it
                throw transactionError
            }
        }
        
        // Fetch updated voter to return
        const updatedVoter = await VoterModel.findById(req.user.id).populate('votedElections')
        res.status(200).json(updatedVoter.votedElections)
    } catch (error) {
        return next(new HttpError(error.message || "Failed to process vote", 500))
    }
}


module.exports={addCandidate,getCandidate,removeCandidate,voteCandidate}