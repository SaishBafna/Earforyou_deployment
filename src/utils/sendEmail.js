
// import nodemailer from 'nodemailer';


// const sendEmail = async (email, subject, message) => {
//     try {
//         let transporter = nodemailer.createTransport({
//             service: 'gmail',  // Using Gmail as the email service
//             auth: {
//                 user: process.env.EMAIL_USER, // Your email id
//                 pass: process.env.EMAIL_PASS // Your password
//             },
//         });

//         let mailOptions = {
//             from: process.env.EMAIL_USER,  // Sender address
//             to: email,  // Recipient's email
//             subject: subject,  // Email subject
//             text: message,  // Plain text message
//         };

//         // Send the email
//         await transporter.sendMail(mailOptions);
//         console.log('Email sent successfully');
//     } catch (error) {
//         console.error('Error sending email:', error);
//         throw new Error('Error sending email');
//     }
// };






import fetch from 'node-fetch';

// Step 1: Fetch Zoho Access Token using refresh token

const getZohoAccessToken = async () => {
    try {
        const params = new URLSearchParams();
        params.append('refresh_token', process.env.ZOHO_REFRESH_TOKEN);
        params.append('client_id', process.env.ZOHO_CLIENT_ID);
        params.append('client_secret', process.env.ZOHO_CLIENT_SECRET);
        params.append('grant_type', 'refresh_token');

        const response = await fetch('https://accounts.zoho.in/oauth/v2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
        });

        const data = await response.json();

        if (data.access_token) {
            return data.access_token;
        } else {
            console.error('Failed to get access token:', data);
            return null;
        }
    } catch (err) {
        console.error('Error fetching access token:', err);
        return null;
    }
};

// Step 2: Send Email using the fresh Zoho Access Token
const sendEmail = async (email, subject, message) => {
    try {
        const authToken = await getZohoAccessToken(); // Get fresh token dynamically
        console.log("authToken",authToken);
        if (!authToken) throw new Error('Unable to get access token');

        const fromEmail = process.env.ZOHO_FROM_EMAIL;
        const accountId = process.env.ZOHO_ACCOUNT_ID;

        const response = await fetch(`https://mail.zoho.com/api/accounts/${accountId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Zoho-oauthtoken ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fromAddress: fromEmail,
                toAddress: email,
                subject: subject,
                content: message,
                mailFormat: 'text' // or 'html'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to send email via Zoho API');
        }

        console.log('✅ Email sent successfully via Zoho API:', data);
        return data;
    } catch (error) {
        console.error('❌ Error sending email via Zoho API:', error);
        throw new Error('Error sending email via Zoho API');
    }
};

export default sendEmail;



// =ukvalleytech@gmail.com
// =leuekrikffdperkg