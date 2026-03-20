import { Resend } from "resend";

let resend: Resend | null = null;

/**
 * Get or initialize Resend client
 */
function getResendClient(): Resend | null {
    if (!process.env.RESEND_API_KEY) {
        return null;
    }

    if (!resend) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }

    return resend;
}

/**
 * Send verification code email to user
 */
export async function sendVerificationEmail(
    email: string,
    code: string,
    name: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const client = getResendClient();

        if (!client) {
            console.warn(
                "RESEND_API_KEY not configured. Email would be sent to:",
                email,
                "Code:",
                code
            );
            return { success: true };
        }

        const result = await client.emails.send({
            from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
            to: email,
            subject: "Verify your Slide Sage email",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; margin-bottom: 20px;">Welcome to Slide Sage, ${name}! 👋</h1>
          
          <p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Thank you for signing up. To complete your account setup, please verify your email address using the code below:
          </p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <p style="margin: 0; color: #999; font-size: 14px; margin-bottom: 10px;">Your verification code is:</p>
            <p style="margin: 0; font-size: 36px; font-weight: bold; color: #000; letter-spacing: 5px;">${code}</p>
          </div>
          
          <p style="color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            This code will expire in 15 minutes. If you didn't create this account, please ignore this email.
          </p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;" />
          
          <p style="color: #999; font-size: 12px;">
            © 2026 Slide Sage. All rights reserved.
          </p>
        </div>
      `,
        });

        if (result.error) {
            console.error("Resend API error:", result.error);
            return { success: false, error: "Failed to send verification email" };
        }

        return { success: true };
    } catch (error) {
        console.error("Error sending verification email:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to send email",
        };
    }
}
