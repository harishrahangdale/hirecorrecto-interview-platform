const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        // Add connection timeout
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });
      
      // Verify connection on startup
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('❌ SMTP connection verification failed:', error.message);
          console.error('   Please check your SMTP configuration in .env file');
          if (error.code === 'EAUTH') {
            console.error('   Authentication failed - check SMTP_USER and SMTP_PASS');
          } else if (error.code === 'ECONNECTION') {
            console.error('   Connection failed - check SMTP_HOST and SMTP_PORT');
          }
        } else {
          console.log('✅ SMTP connection verified successfully');
        }
      });
    } else {
      console.warn('⚠️  SMTP credentials not configured. Email features will be disabled.');
      console.warn('   Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env file');
    }
  }

  async sendInviteEmail(candidateEmail, interviewTitle, inviteToken) {
    // Re-initialize transporter if not set (in case .env was loaded after module initialization)
    if (!this.transporter) {
      this.initializeTransporter();
    }
    
    if (!this.transporter) {
      throw new Error('Email service not configured. Please set SMTP credentials in environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS).');
    }

    const inviteUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/interview/${inviteToken}`;
    
    const htmlContent = this.getInviteEmailHTML(interviewTitle, inviteUrl);
    const textContent = this.getInviteEmailText(interviewTitle, inviteUrl);

    try {
      const info = await this.transporter.sendMail({
        from: `"HireCorrecto" <${process.env.SMTP_USER}>`,
        to: candidateEmail,
        subject: `Interview Invitation: ${interviewTitle}`,
        text: textContent,
        html: htmlContent
      });

      console.log('Invite email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Error sending invite email:', error);
      console.error('Error code:', error.code);
      console.error('Error command:', error.command);
      console.error('Error response:', error.response);
      throw error;
    }
  }

  async sendInviteEmailWithCredentials(candidateEmail, interviewTitle, inviteToken, loginEmail, temporaryPassword, dateWindow) {
    // Re-initialize transporter if not set (in case .env was loaded after module initialization)
    if (!this.transporter) {
      this.initializeTransporter();
    }
    
    if (!this.transporter) {
      throw new Error('Email service not configured. Please set SMTP credentials in environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS).');
    }

    const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/login`;
    const inviteUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/interview/${inviteToken}`;
    
    const htmlContent = this.getInviteEmailWithCredentialsHTML(interviewTitle, loginUrl, inviteUrl, loginEmail, temporaryPassword, dateWindow);
    const textContent = this.getInviteEmailWithCredentialsText(interviewTitle, loginUrl, inviteUrl, loginEmail, temporaryPassword, dateWindow);

    try {
      const info = await this.transporter.sendMail({
        from: `"HireCorrecto" <${process.env.SMTP_USER}>`,
        to: candidateEmail,
        subject: `Interview Invitation: ${interviewTitle}`,
        text: textContent,
        html: htmlContent
      });

      console.log('Invite email with credentials sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Error sending invite email with credentials:', error);
      console.error('Error code:', error.code);
      console.error('Error command:', error.command);
      console.error('Error response:', error.response);
      console.error('Error responseCode:', error.responseCode);
      throw error;
    }
  }

  async sendCompletionEmail(candidateEmail, interviewTitle, results) {
    if (!this.transporter) {
      throw new Error('Email service not configured. Please set SMTP credentials in environment variables.');
    }

    const htmlContent = this.getCompletionEmailHTML(interviewTitle, results);
    const textContent = this.getCompletionEmailText(interviewTitle, results);

    try {
      const info = await this.transporter.sendMail({
        from: `"HireCorrecto" <${process.env.SMTP_USER}>`,
        to: candidateEmail,
        subject: `Interview Completed: ${interviewTitle}`,
        text: textContent,
        html: htmlContent
      });

      console.log('Completion email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Error sending completion email:', error);
      throw error;
    }
  }

  getInviteEmailHTML(interviewTitle, inviteUrl) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Interview Invitation - HireCorrecto</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(135deg, #eef2ff 0%, #ffffff 50%, #faf5ff 100%);">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #eef2ff 0%, #ffffff 50%, #faf5ff 100%);">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); overflow: hidden;">
              <!-- Header with Gradient -->
              <tr>
                <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%); padding: 40px 30px; text-align: center;">
                  <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px); padding: 12px; border-radius: 16px; margin-bottom: 16px;">
                    <span style="font-size: 32px;">✨</span>
                  </div>
                  <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">HireCorrecto</h1>
                  <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 16px; font-weight: 500;">AI-Powered Interview Platform</p>
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 30px; border-radius: 16px; border: 2px solid #e2e8f0; margin-bottom: 30px;">
                    <h2 style="color: #1e293b; margin: 0 0 12px 0; font-size: 24px; font-weight: 700;">🎯 Interview Invitation</h2>
                    <p style="color: #475569; margin: 0 0 20px 0; font-size: 16px; line-height: 1.6;">You have been invited to participate in an AI-powered interview:</p>
                    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 20px; border-radius: 12px; margin: 20px 0;">
                      <h3 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; text-align: center;">${interviewTitle}</h3>
                    </div>
                    
                    <div style="text-align: center; margin: 35px 0;">
                      <a href="${inviteUrl}" 
                         style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 12px; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3), 0 4px 6px -2px rgba(79, 70, 229, 0.2); transition: all 0.2s;">
                        🚀 Start Interview
                      </a>
                    </div>
                    
                    <p style="color: #64748b; font-size: 14px; margin: 25px 0 0 0; text-align: center; line-height: 1.5;">
                      <strong>🔒 Secure Link:</strong> This link is unique to you and will expire after the interview window closes.
                    </p>
                  </div>
                  
                  <!-- AI Interview Guide Section -->
                  <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 30px; border-radius: 16px; border-left: 4px solid #3b82f6; margin-bottom: 30px;">
                    <h3 style="color: #1e40af; margin: 0 0 20px 0; font-size: 20px; font-weight: 700; display: flex; align-items: center;">
                      <span style="margin-right: 10px;">🤖</span> About AI-Powered Interviews
                    </h3>
                    <p style="color: #1e3a8a; margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
                      Our AI interview system uses advanced technology to provide fair, unbiased, and comprehensive evaluation. Your responses are analyzed in real-time for relevance, clarity, and depth.
                    </p>
                    
                    <div style="display: table; width: 100%; margin-top: 25px;">
                      <div style="display: table-row;">
                        <div style="display: table-cell; width: 48%; vertical-align: top; padding-right: 15px;">
                          <div style="background: #ffffff; padding: 20px; border-radius: 12px; border: 2px solid #10b981; margin-bottom: 15px;">
                            <h4 style="color: #059669; margin: 0 0 12px 0; font-size: 16px; font-weight: 700;">✅ DO's</h4>
                            <ul style="color: #047857; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                              <li>Test your camera & microphone beforehand</li>
                              <li>Choose a quiet, well-lit environment</li>
                              <li>Ensure stable internet connection</li>
                              <li>Speak clearly and at a moderate pace</li>
                              <li>Take time to think before answering</li>
                              <li>Be authentic and genuine</li>
                              <li>Look at the camera when speaking</li>
                            </ul>
                          </div>
                        </div>
                        <div style="display: table-cell; width: 48%; vertical-align: top; padding-left: 15px;">
                          <div style="background: #ffffff; padding: 20px; border-radius: 12px; border: 2px solid #ef4444; margin-bottom: 15px;">
                            <h4 style="color: #dc2626; margin: 0 0 12px 0; font-size: 16px; font-weight: 700;">❌ DON'Ts</h4>
                            <ul style="color: #b91c1c; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                              <li>Don't read from scripts or notes</li>
                              <li>Don't rush through answers</li>
                              <li>Don't use background filters excessively</li>
                              <li>Don't have distractions in view</li>
                              <li>Don't interrupt the AI interviewer</li>
                              <li>Don't use multiple devices simultaneously</li>
                              <li>Don't share your interview link</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- What to Expect Section -->
                  <div style="background: #ffffff; padding: 30px; border-radius: 16px; border: 2px solid #e2e8f0; margin-bottom: 30px;">
                    <h3 style="color: #1e293b; margin: 0 0 20px 0; font-size: 20px; font-weight: 700; display: flex; align-items: center;">
                      <span style="margin-right: 10px;">📋</span> What to Expect
                    </h3>
                    <div style="display: table; width: 100%;">
                      <div style="display: table-row;">
                        <div style="display: table-cell; width: 50%; vertical-align: top; padding-right: 10px;">
                          <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 15px; border-radius: 10px; margin-bottom: 12px; border-left: 3px solid #0ea5e9;">
                            <p style="color: #0c4a6e; margin: 0; font-size: 14px; font-weight: 600;">🎥 Video Recording</p>
                            <p style="color: #075985; margin: 5px 0 0 0; font-size: 13px;">Each question is recorded for analysis</p>
                          </div>
                          <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); padding: 15px; border-radius: 10px; margin-bottom: 12px; border-left: 3px solid #10b981;">
                            <p style="color: #065f46; margin: 0; font-size: 14px; font-weight: 600;">⚡ Real-Time Analysis</p>
                            <p style="color: #047857; margin: 5px 0 0 0; font-size: 13px;">AI evaluates responses instantly</p>
                          </div>
                        </div>
                        <div style="display: table-cell; width: 50%; vertical-align: top; padding-left: 10px;">
                          <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 15px; border-radius: 10px; margin-bottom: 12px; border-left: 3px solid #f59e0b;">
                            <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 600;">📊 Comprehensive Scoring</p>
                            <p style="color: #78350f; margin: 5px 0 0 0; font-size: 13px;">Multiple evaluation criteria</p>
                          </div>
                          <div style="background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%); padding: 15px; border-radius: 10px; margin-bottom: 12px; border-left: 3px solid #a855f7;">
                            <p style="color: #6b21a8; margin: 0; font-size: 14px; font-weight: 600;">⚖️ Fair & Unbiased</p>
                            <p style="color: #7e22ce; margin: 5px 0 0 0; font-size: 13px;">Objective AI evaluation</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Tips Section -->
                  <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 25px; border-radius: 16px; border: 2px solid #fbbf24; margin-bottom: 30px;">
                    <h3 style="color: #92400e; margin: 0 0 15px 0; font-size: 18px; font-weight: 700; display: flex; align-items: center;">
                      <span style="margin-right: 10px;">💡</span> Pro Tips for Success
                    </h3>
                    <ul style="color: #78350f; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                      <li>Prepare examples from your experience using the STAR method (Situation, Task, Action, Result)</li>
                      <li>Practice speaking clearly and confidently before starting</li>
                      <li>Review the job description to align your answers with key requirements</li>
                      <li>Take advantage of the thinking time - there's no rush!</li>
                    </ul>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="color: #64748b; font-size: 13px; margin: 0 0 10px 0; line-height: 1.6;">
                    This email was sent by <strong style="color: #4f46e5;">HireCorrecto</strong>. If you have any questions, please contact the recruiter.
                  </p>
                  <p style="color: #94a3b8; font-size: 12px; margin: 15px 0 0 0;">
                    © ${new Date().getFullYear()} HireCorrecto. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  getInviteEmailText(interviewTitle, inviteUrl) {
    return `
HireCorrecto - AI-Powered Interview Platform

Interview Invitation

You have been invited to participate in an interview:

${interviewTitle}

Click the link below to start your interview:
${inviteUrl}

This link is unique to you and will expire after the interview window closes.

What to expect:
- AI-powered interview with real-time analysis
- Video recording for each question
- Immediate feedback and scoring
- Fair and unbiased evaluation

This email was sent by HireCorrecto. If you have any questions, please contact the recruiter.
    `;
  }

  getInviteEmailWithCredentialsHTML(interviewTitle, loginUrl, inviteUrl, loginEmail, temporaryPassword, dateWindow) {
    const startDate = new Date(dateWindow.start).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const endDate = new Date(dateWindow.end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Interview Invitation - HireCorrecto</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(135deg, #eef2ff 0%, #ffffff 50%, #faf5ff 100%);">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #eef2ff 0%, #ffffff 50%, #faf5ff 100%);">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 24px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); overflow: hidden;">
              <!-- Header with Gradient -->
              <tr>
                <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%); padding: 40px 30px; text-align: center;">
                  <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px); padding: 12px; border-radius: 16px; margin-bottom: 16px;">
                    <span style="font-size: 32px;">✨</span>
                  </div>
                  <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">HireCorrecto</h1>
                  <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 16px; font-weight: 500;">AI-Powered Interview Platform</p>
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 30px; border-radius: 16px; border: 2px solid #e2e8f0; margin-bottom: 30px;">
                    <h2 style="color: #1e293b; margin: 0 0 12px 0; font-size: 24px; font-weight: 700;">🎯 Interview Invitation</h2>
                    <p style="color: #475569; margin: 0 0 20px 0; font-size: 16px; line-height: 1.6;">You have been invited to participate in an AI-powered interview:</p>
                    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 20px; border-radius: 12px; margin: 20px 0;">
                      <h3 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; text-align: center;">${interviewTitle}</h3>
                    </div>
                    
                    <!-- Credentials Box -->
                    <div style="background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); padding: 25px; border-radius: 12px; margin: 25px 0; border: 3px solid #4f46e5; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.1);">
                      <h4 style="color: #1e293b; margin: 0 0 20px 0; font-size: 18px; font-weight: 700; display: flex; align-items: center;">
                        <span style="margin-right: 10px;">🔑</span> Your Login Credentials
                      </h4>
                      <div style="background: #f1f5f9; padding: 15px; border-radius: 10px; margin-bottom: 15px; border-left: 4px solid #64748b;">
                        <p style="color: #334155; margin: 0 0 8px 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Email Address</p>
                        <p style="color: #1e293b; margin: 0; font-size: 16px; font-weight: 600; word-break: break-all; background: #ffffff; padding: 10px; border-radius: 6px; font-family: 'Courier New', monospace;">${loginEmail}</p>
                      </div>
                      <div style="background: #fef3c7; padding: 15px; border-radius: 10px; margin-bottom: 15px; border-left: 4px solid #f59e0b;">
                        <p style="color: #92400e; margin: 0 0 8px 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Temporary Password</p>
                        <p style="color: #78350f; margin: 0; font-size: 20px; font-weight: 700; word-break: break-all; background: #ffffff; padding: 12px; border-radius: 6px; font-family: 'Courier New', monospace; letter-spacing: 2px; text-align: center;">${temporaryPassword}</p>
                      </div>
                      <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); padding: 15px; border-radius: 10px; border: 2px solid #ef4444;">
                        <p style="color: #991b1b; margin: 0; font-size: 14px; font-weight: 600; display: flex; align-items: center;">
                          <span style="margin-right: 8px; font-size: 18px;">⚠️</span> 
                          Please save these credentials securely. You will need them to login to the platform.
                        </p>
                      </div>
                    </div>
                    
                    <!-- Interview Window -->
                    <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                      <h4 style="color: #1e40af; margin: 0 0 15px 0; font-size: 16px; font-weight: 700; display: flex; align-items: center;">
                        <span style="margin-right: 10px;">📅</span> Interview Window
                      </h4>
                      <div style="background: #ffffff; padding: 12px; border-radius: 8px; margin-bottom: 10px;">
                        <p style="color: #1e3a8a; margin: 0 0 5px 0; font-size: 13px; font-weight: 600;">Start Date & Time:</p>
                        <p style="color: #1e40af; margin: 0; font-size: 15px; font-weight: 600;">${startDate}</p>
                      </div>
                      <div style="background: #ffffff; padding: 12px; border-radius: 8px;">
                        <p style="color: #1e3a8a; margin: 0 0 5px 0; font-size: 13px; font-weight: 600;">End Date & Time:</p>
                        <p style="color: #1e40af; margin: 0; font-size: 15px; font-weight: 600;">${endDate}</p>
                      </div>
                    </div>
                    
                    <!-- Action Buttons -->
                    <div style="text-align: center; margin: 35px 0;">
                      <a href="${loginUrl}" 
                         style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 12px; display: inline-block; font-weight: 600; font-size: 15px; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3); margin: 5px;">
                        🔐 Login to Platform
                      </a>
                      <a href="${inviteUrl}" 
                         style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 12px; display: inline-block; font-weight: 600; font-size: 15px; box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3); margin: 5px;">
                        🚀 Start Interview
                      </a>
                    </div>
                    
                    <!-- Instructions -->
                    <div style="background: #f0fdf4; padding: 20px; border-radius: 12px; border-left: 4px solid #10b981; margin-top: 25px;">
                      <h4 style="color: #065f46; margin: 0 0 15px 0; font-size: 16px; font-weight: 700;">📝 Instructions</h4>
                      <ol style="color: #047857; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                        <li>Use the credentials above to login to the platform</li>
                        <li>Once logged in, you can access your interview from the dashboard</li>
                        <li>Complete the interview before the window closes</li>
                        <li>You can also start the interview directly using the "Start Interview" button above</li>
                      </ol>
                    </div>
                  </div>
                  
                  <!-- AI Interview Guide Section -->
                  <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 30px; border-radius: 16px; border-left: 4px solid #3b82f6; margin-bottom: 30px;">
                    <h3 style="color: #1e40af; margin: 0 0 20px 0; font-size: 20px; font-weight: 700; display: flex; align-items: center;">
                      <span style="margin-right: 10px;">🤖</span> About AI-Powered Interviews
                    </h3>
                    <p style="color: #1e3a8a; margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
                      Our AI interview system uses advanced technology to provide fair, unbiased, and comprehensive evaluation. Your responses are analyzed in real-time for relevance, clarity, and depth.
                    </p>
                    
                    <div style="display: table; width: 100%; margin-top: 25px;">
                      <div style="display: table-row;">
                        <div style="display: table-cell; width: 48%; vertical-align: top; padding-right: 15px;">
                          <div style="background: #ffffff; padding: 20px; border-radius: 12px; border: 2px solid #10b981; margin-bottom: 15px;">
                            <h4 style="color: #059669; margin: 0 0 12px 0; font-size: 16px; font-weight: 700;">✅ DO's</h4>
                            <ul style="color: #047857; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                              <li>Test your camera & microphone beforehand</li>
                              <li>Choose a quiet, well-lit environment</li>
                              <li>Ensure stable internet connection</li>
                              <li>Speak clearly and at a moderate pace</li>
                              <li>Take time to think before answering</li>
                              <li>Be authentic and genuine</li>
                              <li>Look at the camera when speaking</li>
                            </ul>
                          </div>
                        </div>
                        <div style="display: table-cell; width: 48%; vertical-align: top; padding-left: 15px;">
                          <div style="background: #ffffff; padding: 20px; border-radius: 12px; border: 2px solid #ef4444; margin-bottom: 15px;">
                            <h4 style="color: #dc2626; margin: 0 0 12px 0; font-size: 16px; font-weight: 700;">❌ DON'Ts</h4>
                            <ul style="color: #b91c1c; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                              <li>Don't read from scripts or notes</li>
                              <li>Don't rush through answers</li>
                              <li>Don't use background filters excessively</li>
                              <li>Don't have distractions in view</li>
                              <li>Don't interrupt the AI interviewer</li>
                              <li>Don't use multiple devices simultaneously</li>
                              <li>Don't share your interview link</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- What to Expect Section -->
                  <div style="background: #ffffff; padding: 30px; border-radius: 16px; border: 2px solid #e2e8f0; margin-bottom: 30px;">
                    <h3 style="color: #1e293b; margin: 0 0 20px 0; font-size: 20px; font-weight: 700; display: flex; align-items: center;">
                      <span style="margin-right: 10px;">📋</span> What to Expect
                    </h3>
                    <div style="display: table; width: 100%;">
                      <div style="display: table-row;">
                        <div style="display: table-cell; width: 50%; vertical-align: top; padding-right: 10px;">
                          <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 15px; border-radius: 10px; margin-bottom: 12px; border-left: 3px solid #0ea5e9;">
                            <p style="color: #0c4a6e; margin: 0; font-size: 14px; font-weight: 600;">🎥 Video Recording</p>
                            <p style="color: #075985; margin: 5px 0 0 0; font-size: 13px;">Each question is recorded for analysis</p>
                          </div>
                          <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); padding: 15px; border-radius: 10px; margin-bottom: 12px; border-left: 3px solid #10b981;">
                            <p style="color: #065f46; margin: 0; font-size: 14px; font-weight: 600;">⚡ Real-Time Analysis</p>
                            <p style="color: #047857; margin: 5px 0 0 0; font-size: 13px;">AI evaluates responses instantly</p>
                          </div>
                        </div>
                        <div style="display: table-cell; width: 50%; vertical-align: top; padding-left: 10px;">
                          <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 15px; border-radius: 10px; margin-bottom: 12px; border-left: 3px solid #f59e0b;">
                            <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 600;">📊 Comprehensive Scoring</p>
                            <p style="color: #78350f; margin: 5px 0 0 0; font-size: 13px;">Multiple evaluation criteria</p>
                          </div>
                          <div style="background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%); padding: 15px; border-radius: 10px; margin-bottom: 12px; border-left: 3px solid #a855f7;">
                            <p style="color: #6b21a8; margin: 0; font-size: 14px; font-weight: 600;">⚖️ Fair & Unbiased</p>
                            <p style="color: #7e22ce; margin: 5px 0 0 0; font-size: 13px;">Objective AI evaluation</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Tips Section -->
                  <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 25px; border-radius: 16px; border: 2px solid #fbbf24; margin-bottom: 30px;">
                    <h3 style="color: #92400e; margin: 0 0 15px 0; font-size: 18px; font-weight: 700; display: flex; align-items: center;">
                      <span style="margin-right: 10px;">💡</span> Pro Tips for Success
                    </h3>
                    <ul style="color: #78350f; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                      <li>Prepare examples from your experience using the STAR method (Situation, Task, Action, Result)</li>
                      <li>Practice speaking clearly and confidently before starting</li>
                      <li>Review the job description to align your answers with key requirements</li>
                      <li>Take advantage of the thinking time - there's no rush!</li>
                    </ul>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="color: #64748b; font-size: 13px; margin: 0 0 10px 0; line-height: 1.6;">
                    This email was sent by <strong style="color: #4f46e5;">HireCorrecto</strong>. If you have any questions, please contact the recruiter.
                  </p>
                  <p style="color: #94a3b8; font-size: 12px; margin: 15px 0 0 0;">
                    © ${new Date().getFullYear()} HireCorrecto. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  getInviteEmailWithCredentialsText(interviewTitle, loginUrl, inviteUrl, loginEmail, temporaryPassword, dateWindow) {
    const startDate = new Date(dateWindow.start).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const endDate = new Date(dateWindow.end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    return `
HireCorrecto - AI-Powered Interview Platform

Interview Invitation

You have been invited to participate in an interview:

${interviewTitle}

YOUR LOGIN CREDENTIALS:
Email: ${loginEmail}
Temporary Password: ${temporaryPassword}

⚠️ Please save these credentials securely. You will need them to login.

INTERVIEW WINDOW:
Start: ${startDate}
End: ${endDate}

INSTRUCTIONS:
1. Use the credentials above to login to the platform: ${loginUrl}
2. Once logged in, you can access your interview
3. Complete the interview before the window closes

You can also start the interview directly using this link:
${inviteUrl}

What to expect:
- AI-powered interview with real-time analysis
- Video recording for each question
- Immediate feedback and scoring
- Fair and unbiased evaluation

This email was sent by HireCorrecto. If you have any questions, please contact the recruiter.
    `;
  }

  getCompletionEmailHTML(interviewTitle, results) {
    const overallScore = results.aggregateScores?.overallScore || 0;
    const scoreLabel = overallScore >= 7 ? 'Pass' : overallScore >= 5 ? 'Weak' : 'Fail';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Interview Completed</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0;">HireCorrecto</h1>
          <p style="color: #6b7280; margin: 5px 0 0 0;">AI-Powered Interview Platform</p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #1f2937; margin: 0 0 10px 0;">Interview Completed</h2>
          <p style="color: #4b5563; margin: 0 0 15px 0;">Thank you for completing the interview:</p>
          <h3 style="color: #2563eb; margin: 0 0 20px 0;">${interviewTitle}</h3>
          
          <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h4 style="color: #374151; margin: 0 0 10px 0;">Your Results:</h4>
            <p style="color: #4b5563; margin: 5px 0;"><strong>Overall Score:</strong> ${overallScore.toFixed(1)}/10</p>
            <p style="color: #4b5563; margin: 5px 0;"><strong>Status:</strong> ${scoreLabel}</p>
            <p style="color: #4b5563; margin: 5px 0;"><strong>Questions Answered:</strong> ${results.questions?.length || 0}</p>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            The recruiter will review your complete interview and get back to you with next steps.
          </p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  getCompletionEmailText(interviewTitle, results) {
    const overallScore = results.aggregateScores?.overallScore || 0;
    const scoreLabel = overallScore >= 7 ? 'Pass' : overallScore >= 5 ? 'Weak' : 'Fail';
    
    return `
HireCorrecto - AI-Powered Interview Platform

Interview Completed

Thank you for completing the interview:

${interviewTitle}

Your Results:
- Overall Score: ${overallScore.toFixed(1)}/10
- Status: ${scoreLabel}
- Questions Answered: ${results.questions?.length || 0}

The recruiter will review your complete interview and get back to you with next steps.
    `;
  }
}

// Singleton instance
const emailService = new EmailService();

// Export functions
const sendInviteEmail = (candidateEmail, interviewTitle, inviteToken) => {
  return emailService.sendInviteEmail(candidateEmail, interviewTitle, inviteToken);
};

const sendInviteEmailWithCredentials = (candidateEmail, interviewTitle, inviteToken, loginEmail, temporaryPassword, dateWindow) => {
  return emailService.sendInviteEmailWithCredentials(candidateEmail, interviewTitle, inviteToken, loginEmail, temporaryPassword, dateWindow);
};

const sendCompletionEmail = (candidateEmail, interviewTitle, results) => {
  return emailService.sendCompletionEmail(candidateEmail, interviewTitle, results);
};

module.exports = {
  sendInviteEmail,
  sendInviteEmailWithCredentials,
  sendCompletionEmail,
  emailService
};
