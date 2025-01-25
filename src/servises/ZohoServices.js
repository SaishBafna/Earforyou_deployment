import axios from 'axios';
import ZohoToken from '../models/TokenStore.js';
import dotenv from 'dotenv';

dotenv.config();

const ZOHO_SCOPES = 'ZohoMail.contacts.CREATE,ZohoMail.partner.organization.UPDATE,ZohoCampaigns.contact.CREATE';
const ZOHO_API_BASE_URL = 'https://campaigns.zoho.in/api/v1.1/json';
const ZOHO_AUTH_BASE_URL = 'https://accounts.zoho.in/oauth/v2';
const TOKEN_EXPIRY_TIME = 3600; // Default expiry time in seconds

const debugLog = (message, data) => {
    console.log(`[DEBUG] ${message}:`, JSON.stringify(data, null, 2));
};

const isTokenExpired = (error) => {
    return error?.response?.data?.message === 'Unauthorized request.' || 
           error?.message?.includes('Unauthorized') ||
           error?.response?.status === 401;
};

const getAuthorizationCode = () => {
    const authUrl = new URL(`${ZOHO_AUTH_BASE_URL}/auth`);
    const params = {
        client_id: process.env.ZOHO_CLIENT_ID,
        response_type: 'code',
        scope: ZOHO_SCOPES,
        redirect_uri: process.env.ZOHO_REDIRECT_URI,
        access_type: 'offline',
        prompt: 'consent'
    };

    Object.entries(params).forEach(([key, value]) => {
        authUrl.searchParams.append(key, value || '');
    });

    return authUrl.toString();
};

const handleCallback = async (code) => {
    try {
        const params = new URLSearchParams({
            code,
            client_id: process.env.ZOHO_CLIENT_ID,
            client_secret: process.env.ZOHO_CLIENT_SECRET,
            redirect_uri: process.env.ZOHO_REDIRECT_URI,
            grant_type: 'authorization_code',
            scope: ZOHO_SCOPES
        });

        const response = await axios.post(
            `${ZOHO_AUTH_BASE_URL}/token`,
            params.toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        if (response.data.error) throw new Error(`Zoho API error: ${response.data.error}`);

        // Store access token
        await ZohoToken.create({
            reason: 'access_token',
            token: response.data.access_token
        });

        // Store refresh token separately
        if (response.data.refresh_token) {
            await ZohoToken.create({
                reason: 'refresh_token',
                token: response.data.refresh_token
            });
        }

        debugLog('OAuth success', response.data);
        return response.data;
    } catch (error) {
        debugLog('OAuth error', error);
        throw error;
    }
};

const refreshAccessToken = async () => {
    try {
        const refreshTokenDoc = await ZohoToken.findOne({ 
            reason: 'refresh_token' 
        }).sort({ createdAt: -1 });

        if (!refreshTokenDoc) throw new Error('No refresh token found');

        const params = new URLSearchParams({
            client_id: process.env.ZOHO_CLIENT_ID,
            client_secret: process.env.ZOHO_CLIENT_SECRET,
            refresh_token: refreshTokenDoc.token,
            grant_type: 'refresh_token',
            scope: ZOHO_SCOPES
        });

        const response = await axios.post(
            `${ZOHO_AUTH_BASE_URL}/token`,
            params.toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        if (response.data.error) throw new Error(`Zoho API error: ${response.data.error}`);

        const newToken = await ZohoToken.create({
            reason: 'access_token',
            token: response.data.access_token
        });

        debugLog('Token refreshed', { newToken: newToken.token?.substring(0, 10) + '...' });
        return { access_token: newToken.token };
    } catch (error) {
        debugLog('Token refresh failed', error);
        throw error;
    }
};

const getAccessToken = async () => {
    try {
        const token = await ZohoToken.findOne({ 
            reason: 'access_token' 
        }).sort({ createdAt: -1 });
        
        if (!token) {
            throw new Error('No access token found');
        }

        // Check if token is older than 50 minutes (allowing buffer before 1-hour expiry)
        const tokenAge = (Date.now() - token.createdAt.getTime()) / 1000;
        if (tokenAge > (TOKEN_EXPIRY_TIME - 600)) {
            debugLog('Token expired or about to expire, refreshing');
            const refreshedToken = await refreshAccessToken();
            return refreshedToken.access_token;
        }

        return token.token;
    } catch (error) {
        debugLog('Token retrieval failed', error);
        throw error;
    }
};

const makeAuthenticatedRequest = async (url, data, retryCount = 0) => {
    try {
        const accessToken = await getAccessToken();
        const response = await axios.post(url, data, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        return response;
    } catch (error) {
        if (isTokenExpired(error) && retryCount < 2) {
            debugLog('Token expired, refreshing and retrying request');
            await refreshAccessToken();
            return makeAuthenticatedRequest(url, data, retryCount + 1);
        }
        throw error;
    }
};

const addToMailingList = async (email) => {
    try {
        debugLog('Starting mailing list operation', { email });

        const data = {
            listkey: process.env.ZOHO_LIST_KEY,
            emailids: email,
            source: "web"
        };

        const response = await makeAuthenticatedRequest(
            `${ZOHO_API_BASE_URL}/listsubscribe`,
            data
        );

        // Parse XML response
        const responseData = {
            status: response.data.match(/<status>(.*?)<\/status>/)?.[1],
            message: response.data.match(/<message>(.*?)<\/message>/)?.[1],
            code: response.data.match(/<code>(.*?)<\/code>/)?.[1]
        };

        if (responseData.status === 'error') {
            throw new Error(responseData.message || 'Unknown error occurred');
        }

        return {
            success: true,
            message: 'Email successfully added',
            data: responseData
        };

    } catch (error) {
        debugLog('Operation failed', error);
        return {
            success: false,
            message: error.message,
            error: error
        };
    }
};

export {
    generateTokens,
    getAccessToken,
    refreshAccessToken,
    addToMailingList,
    getAuthorizationCode,
    handleCallback
};