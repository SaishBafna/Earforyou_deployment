
import crypto from 'crypto';
import sendEmail from './sendEmail.js';

export const generateOtp = () => {
    const otp = crypto.randomBytes(3).toString('hex');
    const numericOtp = parseInt(otp, 16).toString().slice(0, 6);
  
    if (numericOtp.length < 6) {
      return generateOtp(); // Ensure the OTP is always 6 digits
    }
  
    return numericOtp;
  };

export const sendOtpEmail = async (email, otp) => {
    const subject = 'Your OTP Code';
    const message = `Your OTP code is ${otp}. It will expire in 1 hour.`;

    await sendEmail(email, subject, message);
};



export const SendTemplate = async (email, name) => {
  const subject = "Invitation to EFY Listener Zoom Meeting – Let’s Connect!";
  const message = `
Dear ${name},

We hope you’re doing well!

As a valued listener on EFY (Ear For You), we appreciate the time and effort you put into creating a safe space for others.

📅 **Meeting Details:**  
   - **Date:** 23-03-2025  
   - **Time:** 12:00 PM (GMT+5:30)  
   - **Platform:** Zoom  
   - **Meeting Link:** [Join Here](https://us06web.zoom.us/j/85690033176?pwd=lR80O9Tx6jDy9LSDdfc2ewFoXgy6vR.1)

### **In this session, we’ll:**  
✅ Share insights and updates about EFY  
✅ Discuss best practices for listening and support  
✅ Address any questions or concerns you may have  

Your presence and input are important to us, and we’d love to hear your thoughts!  

Looking forward to seeing you there.  

**Best regards,**  
**EFY Team**
`;

  await sendEmail(email, subject, message);
};
