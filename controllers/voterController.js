const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')


const VoterModel=require('../models/voterModel')
const HttpError=require('../models/ErrorModel')


//===========Register new voter 
//post :api/voters/register
//unprotected
const registerVoter = async (req,res,next)=>{
    try{
        const {fullName,email,password,password2}=req.body;
        if(!fullName || !email ||!password || !password2){
            return next(new HttpError("Fill in all fields.",422))
        }
        //make all emails lowercased
        const newEmail = email.toLowerCase()
        
        //check if email domain is @srmap.edu.in
        if(!newEmail.endsWith('@srmap.edu.in')){
            return next(new HttpError("Only @srmap.edu.in email addresses are allowed.",422))
        }
        
        //check if the email already exsits in db
        const emailExists = await VoterModel.findOne({email: newEmail})
        if(emailExists){
            return next(new HttpError("Email already exist.",422))
        }
        
        //make sure password 6+ characters
        if((password.trim().length)<6){
            return next(new HttpError("Password should atleast 6 characters.",422))
        }
        
        //password strength validation: at least one uppercase, one lowercase, and one special character
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).*$/
        if(!passwordRegex.test(password)){
            return next(new HttpError("Password must contain at least one uppercase letter, one lowercase letter, and one special character.",422))
        }
        //make sure passwords match
        if(password !=password2){
            return next(new HttpError("Passwords do not match",422))
        }
        // hash password
        const salt=await bcrypt.genSalt(10);
        const hashedPassword=await bcrypt.hash(password,salt);
        // No user/voter should be admin except for one with email "admin@srmap.edu.in"
        let isAdmin=false;
        if(newEmail == "admin@srmap.edu.in"){
            isAdmin=true
        }
        //save new voter to db
        const newVoter = await VoterModel.create({fullName,email:newEmail,password:hashedPassword,isAdmin})
        res.status(201).json(`New voter ${fullName} created.`)
    }catch (error){
        return next(new HttpError("Voter registration failed.",422))
    }
}






//function to generate token
const generateToken =(payload) =>{
    const token=jwt.sign(payload, process.env.JWT_SECRET,{expiresIn: "1d"})
    return token;
}



//===========Login new voter 
//post :api/voters/login
//unprotected
const loginVoter = async (req,res,next)=>{
    try{
        const {email,password}=req.body;
        if(!email || !password){
            return next(new HttpError("Fill in all fields.",422))
        }
        const newEmail=email.toLowerCase()
        const voter = await VoterModel.findOne({email: newEmail})
        if(!voter){
            return next(new HttpError("Invalid credentials.",422))
        }
        //compare passwords
        const comparePass = await bcrypt.compare(password,voter.password)
        if(!comparePass){
            return next(new HttpError("Invalid credentials.",422))
        }
        const {_id:id,isAdmin,votedElections}=voter;
        const token=generateToken({id,isAdmin})

        res.json({token,id,votedElections,isAdmin})
    }catch (error){
        return next(new HttpError("Login failed. Please check your credentials or try again later.",422))
    }
}

//===========get voter 
//get :api/voters/:id
//protected
const getVoter = async (req,res,next)=>{
    try{
        const {id} =req.params;
        const voter=await VoterModel.findById(id).select("-password")
        res.json(voter)
    }catch(error){
        return next(new HttpError("Couldn't get voter",404))
    }
}


module.exports={registerVoter,loginVoter,getVoter}