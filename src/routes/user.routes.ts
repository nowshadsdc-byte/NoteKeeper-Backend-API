import express from 'express';
import { createUser, loginUser } from '../controllers/user.controller.js';
import { loginRateLimit } from '../middleware/loginRateLimit.js';
//loginRateLimit, 

const router = express.Router(); 

//Registration User 
router.post('/register',createUser)
router.post('/login',loginRateLimit, loginUser);


export default router;