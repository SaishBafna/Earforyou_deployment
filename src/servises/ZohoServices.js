import axios from 'axios';
import ZohoToken from '../models/TokenStore.js';
import dotenv from 'dotenv';

dotenv.config();

const getNewToken = async () => {
    const tokenUrl = `https://accounts.zoho.in/oauth/v2/token?client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&grant_type=client_credentials&scope=ZohoMail.partner.organization.UPDATE`;
    
    const response = await axios.post(tokenUrl);
    const { access_token } = response.data;
    
    await ZohoToken.create({ 
        reason: 'access_token', 
        token: access_token 
    });

    return access_token;
};

const generateZohoTokens = async () => {
    try {
        const existingToken = await ZohoToken.findOne({ reason: 'access_token' });
        if (existingToken) {
            return { access_token: existingToken.token };
        }
        
        const access_token = await getNewToken();
        return { access_token };
    } catch (error) {
        console.error('Token generation failed:', error);
        throw error;
    }
};

const getZohoAccessToken = async () => {
    try {
        const token = await ZohoToken.findOne({ reason: 'access_token' })
            .sort({ createdAt: -1 });
        return token ? token.token : null;
    } catch (error) {
        console.error('Error retrieving token:', error);
        throw error;
    }
};

const refreshZohoAccessToken = async () => {
    try {
        const access_token = await getNewToken();
        return { access_token };
    } catch (error) {
        console.error('Token refresh failed:', error);
        throw error;
    }
};

const addUserToMailingList = async (name, email) => {
    try {
        let accessToken = await getZohoAccessToken();

        if (!accessToken) {
            const tokens = await generateZohoTokens();
            accessToken = tokens.access_token;
        }

        const contactInfo = encodeURIComponent(
            JSON.stringify({
                'Name': name,
                'Email': email,
            })
        );

        const url = `${process.env.ZOHO_API_URL}?resfmt=JSON&listkey=${process.env.ZOHO_LIST_KEY}&contactinfo=${contactInfo}&source=web`;

        try {
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                },
            });
            return response.data;
        } catch (error) {
            if (error.response?.data?.message === 'Unauthorized request.') {
                const tokens = await refreshZohoAccessToken();
                accessToken = tokens.access_token;
                
                const retryResponse = await axios.get(url, {
                    headers: {
                        Authorization: `Zoho-oauthtoken ${accessToken}`,
                    },
                });
                return retryResponse.data;
            }
            throw error;
        }
    } catch (error) {
        console.error('Mailing list operation failed:', error);
        throw error;
    }
};

export { generateZohoTokens, getZohoAccessToken, refreshZohoAccessToken, addUserToMailingList };