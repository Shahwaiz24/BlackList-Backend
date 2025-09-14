import { sign, verify } from "securex";
import { Transporter } from "nodemailer";
import nodemailer from "nodemailer";

class EmailService {
    private static transporter: Transporter;
    private static async getTransporter(): Promise<Transporter> {
        if (!EmailService.transporter) {
            try {
                // Validate required environment variables
                if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
                    throw new Error("SMTP configuration is incomplete. Please check your environment variables.");
                }

                EmailService.transporter = await nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: Number(process.env.SMTP_PORT) || 587,
                    secure: false,
                    auth: {
                        user: process.env.SMTP_USERNAME,
                        pass: process.env.SMTP_PASSWORD
                    },
                    connectionTimeout: 5000,
                    greetingTimeout: 3000,
                    socketTimeout: 5000,
                    pool: true,
                    maxConnections: 5,
                    maxMessages: 100,
                    rateDelta: 20000,
                    rateLimit: 5
                });


                console.log('SMTP transporter created successfully');
            } catch (error: any) {
                console.error('Failed to create SMTP transporter:', error?.message ?? "Unknown error");
                throw new Error(`SMTP configuration error: ${error?.message ?? "Unknown error"}`);
            }
        }
        return EmailService.transporter;
    }

    static async sendVerficationEmail(email: string, userId: string): Promise<any> {
        try {
            if (!email || !userId) {
                throw new Error("Email and userId are required");
            }

            // Check required environment variables 
            if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
                throw new Error("SMTP configuration is missing. Please check SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD environment variables");
            }

            if (!process.env.SECUREX_KEY) {
                throw new Error("SECUREX_KEY environment variable is missing");
            }

            if (!process.env.VERFICATION_TOKEN_EXPIRY) {
                throw new Error("VERFICATION_TOKEN_EXPIRY environment variable is missing");
            }

            if (!process.env.FRONTEND_URL) {
                throw new Error("FRONTEND_URL environment variable is missing");
            }
            if (!process.env.FRONTEND_VERIFY_EMAIL_PATH) {
                throw new Error("FRONTEND_VERIFY_EMAIL_PATH environment variable is missing");
            }

            const verficationToken = await sign({
                "type": "verify",
                "userId": userId,
                "email": email
            }, process.env.SECUREX_KEY as string, Number(process.env.VERFICATION_TOKEN_EXPIRY as string));
            const verficationUrl = `${process.env.FRONTEND_URL}${process.env.FRONTEND_VERIFY_EMAIL_PATH}${verficationToken}`;
            const emailSubject = "Verify Your Email - TheBlacklistXYZ";

            const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: Arial, sans-serif; 
                    background: #0a0a0a; 
                    color: #ffffff; 
                    padding: 20px; 
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: #1a1a1a;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }
                .header {
                    background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
                    padding: 30px;
                    text-align: center;
                    border-bottom: 2px solid #333;
                }
                .logo {
                    font-size: 24px;
                    font-weight: bold;
                    color: #ffffff;
                    margin-bottom: 5px;
                    letter-spacing: 1px;
                }
                .tagline {
                    color: #888;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }
                .content {
                    padding: 40px 30px;
                }
                .title {
                    color: #ff7b00;
                    font-size: 20px;
                    margin-bottom: 20px;
                    text-align: center;
                    font-weight: 600;
                }
                .message {
                    color: #cccccc;
                    font-size: 16px;
                    line-height: 1.6;
                    margin-bottom: 30px;
                    text-align: center;
                }
                .button-container {
                    text-align: center;
                    margin: 30px 0;
                }
                .verify-btn {
                    display: inline-block;
                    background: #ff7b00;
                    color: #ffffff;
                    text-decoration: none;
                    padding: 14px 35px;
                    border-radius: 25px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    transition: all 0.3s ease;
                    font-size: 14px;
                }
                .verify-btn:hover {
                    background: #e56b00;
                    transform: translateY(-1px);
                    box-shadow: 0 5px 15px rgba(255, 123, 0, 0.3);
                }
                .divider {
                    height: 1px;
                    background: #333;
                    margin: 30px 0;
                }
                .alt-method {
                    background: #252525;
                    padding: 20px;
                    border-radius: 6px;
                    margin: 20px 0;
                }
                .alt-method h4 {
                    color: #ff7b00;
                    font-size: 14px;
                    margin-bottom: 10px;
                }
                .alt-method p {
                    color: #aaa;
                    font-size: 13px;
                    margin-bottom: 10px;
                }
                .link-box {
                    background: #1a1a1a;
                    padding: 12px;
                    border-radius: 4px;
                    color: #66ccff;
                    font-size: 11px;
                    word-break: break-all;
                    font-family: monospace;
                    border: 1px solid #333;
                }
                .footer {
                    background: #151515;
                    padding: 25px;
                    text-align: center;
                    border-top: 1px solid #333;
                }
                .footer p {
                    color: #666;
                    font-size: 12px;
                    margin: 5px 0;
                }
                .security {
                    background: #2a1a1a;
                    border-left: 3px solid #ff4444;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 0 4px 4px 0;
                }
                .security h4 {
                    color: #ff4444;
                    font-size: 13px;
                    margin-bottom: 8px;
                }
                .security p {
                    color: #ccc;
                    font-size: 12px;
                    line-height: 1.4;
                }
                @media (max-width: 600px) {
                    .container { margin: 10px; }
                    .content { padding: 25px 20px; }
                    .verify-btn { padding: 12px 25px; font-size: 13px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">TheBlacklistXYZ</div>
                    <div class="tagline">Premium Platform</div>
                </div>
                
                <div class="content">
                    <div class="title">Email Verification Required</div>
                    
                    <div class="message">
                        Welcome to TheBlacklistXYZ! Please verify your email address to complete your registration and access all platform features.
                    </div>
                    
                    <div class="button-container">
                        <a href="${verficationUrl}" class="verify-btn">Verify Email</a>
                    </div>
                    
                    <div class="divider"></div>
                    
                    <div class="alt-method">
                        <h4>Can't click the button?</h4>
                        <p>Copy and paste this link in your browser:</p>
                        <div class="link-box">${verficationUrl}</div>
                    </div>
                    
                    <div class="security">
                        <h4>⚠️ Security Notice</h4>
                        <p>This link expires in 10 minutes. If you didn't register, please ignore this email.</p>
                    </div>
                </div>
                
                <div class="footer">
                    <p><strong>TheBlacklistXYZ</strong></p>
                    <p>© ${new Date().getFullYear()} All rights reserved.</p>
                    <p>Need help? Contact our support team.</p>
                </div>
            </div>
        </body>
        </html>
        `;

            const emailData = {
                from: process.env.SMTP_FROM,
                to: email,
                subject: emailSubject,
                html: emailHtml
            };

            const transporter = await EmailService.getTransporter();
            const emailPromise = transporter.sendMail(emailData);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Email sending timeout after 5 seconds')), 5000);
            });

            await Promise.race([emailPromise, timeoutPromise]);
            return true;
        } catch (error: any) {
            console.error('Error sending verification email:', error?.message ?? "Unknown error");
            throw new Error(`Failed to send verification email: ${error?.message ?? "Unknown error"}`);
        }
    }

    static async sendForgotPasswordEmail(email: string, userId: string): Promise<any> {
        try {
            if (!email || !userId) {
                throw new Error("Email and userId are required");
            }

            if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
                throw new Error("SMTP configuration is missing. Please check SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD environment variables");
            }

            if (!process.env.SECUREX_KEY) {
                throw new Error("SECUREX_KEY environment variable is missing");
            }

            if (!process.env.RESET_PASSWORD_TOKEN_EXPIRY) {
                throw new Error("PASSWORD_RESET_TOKEN_EXPIRY environment variable is missing");
            }

            if (!process.env.FRONTEND_URL) {
                throw new Error("FRONTEND_URL environment variable is missing");
            }

            if (!process.env.FRONTEND_RESET_PASSWORD_PATH) {
                throw new Error("FRONTEND_RESET_PASSWORD_PATH environment variable is missing");
            }

            const resetPasswordToken = await sign({
                "type": "reset_password",
                "userId": userId,
                "email": email
            }, process.env.SECUREX_KEY as string, Number(process.env.RESET_PASSWORD_TOKEN_EXPIRY as string));

            const resetPasswordUrl = `${process.env.FRONTEND_URL}${process.env.FRONTEND_RESET_PASSWORD_PATH}${resetPasswordToken}`;
            const emailSubject = "Reset Your Password - TheBlacklistXYZ";

            const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: Arial, sans-serif; 
                    background: #0a0a0a; 
                    color: #ffffff; 
                    padding: 20px; 
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: #1a1a1a;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }
                .header {
                    background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
                    padding: 30px;
                    text-align: center;
                    border-bottom: 2px solid #333;
                }
                .logo {
                    font-size: 24px;
                    font-weight: bold;
                    color: #ffffff;
                    margin-bottom: 5px;
                    letter-spacing: 1px;
                }
                .tagline {
                    color: #888;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }
                .content {
                    padding: 40px 30px;
                }
                .title {
                    color: #ff7b00;
                    font-size: 20px;
                    margin-bottom: 20px;
                    text-align: center;
                    font-weight: 600;
                }
                .message {
                    color: #cccccc;
                    font-size: 16px;
                    line-height: 1.6;
                    margin-bottom: 30px;
                    text-align: center;
                }
                .button-container {
                    text-align: center;
                    margin: 30px 0;
                }
                .reset-btn {
                    display: inline-block;
                    background: #ff7b00;
                    color: #ffffff;
                    text-decoration: none;
                    padding: 14px 35px;
                    border-radius: 25px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    transition: all 0.3s ease;
                    font-size: 14px;
                }
                .reset-btn:hover {
                    background: #e56b00;
                    transform: translateY(-1px);
                    box-shadow: 0 5px 15px rgba(255, 123, 0, 0.3);
                }
                .divider {
                    height: 1px;
                    background: #333;
                    margin: 30px 0;
                }
                .alt-method {
                    background: #252525;
                    padding: 20px;
                    border-radius: 6px;
                    margin: 20px 0;
                }
                .alt-method h4 {
                    color: #ff7b00;
                    font-size: 14px;
                    margin-bottom: 10px;
                }
                .alt-method p {
                    color: #aaa;
                    font-size: 13px;
                    margin-bottom: 10px;
                }
                .link-box {
                    background: #1a1a1a;
                    padding: 12px;
                    border-radius: 4px;
                    color: #66ccff;
                    font-size: 11px;
                    word-break: break-all;
                    font-family: monospace;
                    border: 1px solid #333;
                }
                .footer {
                    background: #151515;
                    padding: 25px;
                    text-align: center;
                    border-top: 1px solid #333;
                }
                .footer p {
                    color: #666;
                    font-size: 12px;
                    margin: 5px 0;
                }
                .security {
                    background: #2a1a1a;
                    border-left: 3px solid #ff4444;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 0 4px 4px 0;
                }
                .security h4 {
                    color: #ff4444;
                    font-size: 13px;
                    margin-bottom: 8px;
                }
                .security p {
                    color: #ccc;
                    font-size: 12px;
                    line-height: 1.4;
                }
                .warning {
                    background: #1a2a1a;
                    border-left: 3px solid #66ff66;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 0 4px 4px 0;
                }
                .warning h4 {
                    color: #66ff66;
                    font-size: 13px;
                    margin-bottom: 8px;
                }
                .warning p {
                    color: #ccc;
                    font-size: 12px;
                    line-height: 1.4;
                }
                @media (max-width: 600px) {
                    .container { margin: 10px; }
                    .content { padding: 25px 20px; }
                    .reset-btn { padding: 12px 25px; font-size: 13px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">TheBlacklistXYZ</div>
                    <div class="tagline">Premium Platform</div>
                </div>
                
                <div class="content">
                    <div class="title">Password Reset Request</div>
                    
                    <div class="message">
                        We received a request to reset your password for your TheBlacklistXYZ account. Click the button below to create a new password.
                    </div>
                    
                    <div class="button-container">
                        <a href="${resetPasswordUrl}" class="reset-btn">Reset Password</a>
                    </div>
                    
                    <div class="divider"></div>
                    
                    <div class="alt-method">
                        <h4>Can't click the button?</h4>
                        <p>Copy and paste this link in your browser:</p>
                        <div class="link-box">${resetPasswordUrl}</div>
                    </div>
                    
                    <div class="security">
                        <h4>⚠️ Security Notice</h4>
                        <p>This password reset link expires in 10 minutes for your security. If you didn't request this reset, please ignore this email.</p>
                    </div>
                    
                    <div class="warning">
                        <h4>ℹ️ Important</h4>
                        <p>If you didn't request a password reset, your account is still secure. Someone may have entered your email by mistake.</p>
                    </div>
                </div>
                
                <div class="footer">
                    <p><strong>TheBlacklistXYZ</strong></p>
                    <p>© ${new Date().getFullYear()} All rights reserved.</p>
                    <p>Need help? Contact our support team.</p>
                </div>
            </div>
        </body>
        </html>
        `;

            const emailData = {
                from: process.env.SMTP_FROM,
                to: email,
                subject: emailSubject,
                html: emailHtml
            };

            const transporter = await EmailService.getTransporter();
            const emailPromise = transporter.sendMail(emailData);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Email sending timeout after 5 seconds')), 5000);
            });

            await Promise.race([emailPromise, timeoutPromise]);
            return true;
        } catch (error: any) {
            console.error('Error sending password reset email:', error?.message ?? "Unknown error");
            throw new Error(`Failed to send password reset email: ${error?.message ?? "Unknown error"}`);
        }
    }

}
export default EmailService;