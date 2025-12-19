const {v4:uuid}=require("uuid")
const cloudinary=require('../utils/cloudinary')
const path=require("path")

const HttpError=require('../models/ErrorModel')
const ElectionModal = require('../models/electionModel')
const CandidateModel = require('../models/candidateModel')

//===========ADD NEW ELECTION
//post :api/elections
//protected (only admin)
const addElection = async(req,res,next)=>{
   try {
        //only admin can add election
        if(!req.user.isAdmin){
            return next(new HttpError("Only an admin can perform this action.",403))
        }

        const {title,description}=req.body;
        if(!title || !description){
            return next(new HttpError("Fill all fields.",422))
        }

        if(!req.files.club){
            return next(new HttpError("Choose a club.",422))
        }

        const {club}=req.files;
        //image sould be less than 1mb
        if(club.size > 1000000) {
            return next(new HttpError("File size too big.Should be less than 1mb"))
        }

        //rename the image
        let fileName=club.name;
        fileName=fileName.split(".")
        fileName=fileName[0] +uuid() +"."+fileName[fileName.length-1]
        //upload file to uploads folder in project
        await club.mv(path.join(__dirname,'..','uploads',fileName),async (err)=>{
            if(err){
                return next(new HttpError(err))
            }
            //store image on cloudinary
            const result =await cloudinary.uploader.upload(path.join(__dirname,"..","uploads",fileName),{resource_type: "image"})
            if(!result.secure_url){
                return next(new HttpError("Couldn't upload image to cloudinary",422))
            }
            //save election to db
            const newElection=await ElectionModal.create({title,description,club:result.secure_url})
            res.json(newElection)
    })
   } catch (error) {
    return next(new HttpError(error))
   }
}





//===========get all ELECTION
//get :api/elections
//protected 
const getElections = async(req,res,next)=>{
    try {
        const elections = await ElectionModal.find();
        res.status(200).json(elections)
    } catch (error) {
        return next(new HttpError(error))
    }
}





//===========GET SINGLE ELECTION
//get :api/elections/:id
//protected 
const getElection = async(req,res,next)=>{
    try {
        const {id} =req.params;
        const election = await ElectionModal.findById(id)
        res.status(200).json(election)
    } catch (error) {
        return next(new HttpError(error))
    }
}





//=========== get ELECTION candidates
//get :api/elections/id/candidates
//protected 
const getCandidatesOfElection = async (req,res,next)=>{
    try {
        const {id}=req.params;
        const candidates = await CandidateModel.find({election: id})
        res.status(200).json(candidates)

    } catch (error) {
        return next(new HttpError(error))
    }
}





//===========get voters of ELECTION
//get :api/elections/:id/voters
//protected 
const getElectionVoters = async (req,res,next)=>{
    try {
        const {id} =req.params;
        const respone = await ElectionModal.findById(id).populate('voters')
        res.status(200).json(respone.voters)
    } catch (error) {
        return next(new HttpError(error))
    }
}





//===========update ELECTION
//patch :api/elections/id
//protected (only admin)
const updateElection = async (req,res,next)=>{
    try {
        //only admin can add election
        if(!req.user.isAdmin){
            return next(new HttpError("Only an admin can perform this action.",403))
        }
        const {id}=req.params;
        const {title,description} = req.body;
        if(!title || !description){
            return next(new HttpError("Fill in all fields.",422))
        }

        // Check if election exists
        const existingElection = await ElectionModal.findById(id)
        if(!existingElection){
            return next(new HttpError("Election not found",404))
        }

        // If new image is provided, upload it
        if(req.files && req.files.club){
            const {club} = req.files;
            //image size should be less than 1mb
            if(club.size > 1000000){
                return next(new HttpError("Image size too big. Should be less than 1mb",422))
            }

            //rename the image
            let fileName=club.name;
            fileName=fileName.split(".")
            fileName=fileName[0] +uuid() +"."+fileName[fileName.length-1]
            const filePath = path.join(__dirname,'..','uploads',fileName)
            
            try {
                // Upload file to uploads folder
                await new Promise((resolve, reject) => {
                    club.mv(filePath, (err) => {
                        if(err) reject(err)
                        else resolve()
                    })
                })
                
                //store image on cloudinary
                const result = await cloudinary.uploader.upload(filePath,{resource_type: "image"})
                //check if cloudinary storage was successful
                if(!result.secure_url){
                    return next(new HttpError("Image upload to cloudinary was not successful",422))
                }

                // Update election with new image
                await ElectionModal.findByIdAndUpdate(id, {title,description,club:result.secure_url})
                res.status(200).json({message: "Election updated successfully"})
            } catch (error) {
                return next(new HttpError(error.message || "Failed to update election", 500))
            }
        } else {
            // No new image, just update title and description
            await ElectionModal.findByIdAndUpdate(id, {title,description})
            res.status(200).json({message: "Election updated successfully"})
        }

    } catch (error) {
        return next(new HttpError(error.message || "Failed to update election", 500))
    }
}

//===========DELETE ELECTION
//delete :api/elections/:id
//protected (only admin)
const removeElection = async (req,res,next)=>{
    try {
        //only admin can add election
        if(!req.user.isAdmin){
            return next(new HttpError("Only an admin can perform this action.",403))
        }

        const {id} =req.params;
        await ElectionModal.findByIdAndDelete(id);
        //delete candidates that belong to this election
        await CandidateModel.deleteMany({election: id})
        res.status(200).json("Election deleted successfully.")
    } catch (error) {
        return next(new HttpError(error))
    }
}


module.exports={addElection,getElections,getElection,updateElection,removeElection,
getCandidatesOfElection,getElectionVoters}