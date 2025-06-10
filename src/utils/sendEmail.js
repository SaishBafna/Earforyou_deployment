
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


const sendEmail = async (email, subject, message) => {
    try {
        const authToken = process.env.ZOHO_MAIL_AUTH_TOKEN;
        const fromEmail = process.env.ZOHO_FROM_EMAIL;
        const accountId = process.env.ZOHO_ACCOUNT_ID;

        const response = await fetch('https://mail.zoho.com/api/accounts/' + accountId + '/messages', {
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
                mailFormat: 'text' // or 'html' if sending HTML content
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to send email via Zoho API');
        }

        console.log('Email sent successfully via Zoho API:', data);
        return data;
    } catch (error) {
        console.error('Error sending email via Zoho API:', error);
        throw new Error('Error sending email via Zoho API');
    }
};

export default sendEmail;


// =ukvalleytech@gmail.com   
// =leuekrikffdperkg