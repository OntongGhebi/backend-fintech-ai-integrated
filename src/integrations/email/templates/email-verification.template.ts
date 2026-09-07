export function emailVerificationTemplate(
  name: string,
  verificationUrl: string,
): string {
  return `
    <h2>Hello ${name},</h2>

    <p>
      Thank you for creating your account.
    </p>

    <p>
      Please verify your email address by clicking
      the button below.
    </p>

    <p>
      <a
        href="${verificationUrl}"
        style="
          display: inline-block;
          padding: 12px 20px;
          background: #000;
          color: #fff;
          text-decoration: none;
          border-radius: 6px;
        "
      >
        Verify Email
      </a>
    </p>

    <p>
      This link will expire soon.
    </p>
  `;
}
