const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, html) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER || "deblissrestaurant@gmail.com",
      pass: process.env.EMAIL_PASS || "axff cayg faff oaok",
    },
  });

  const mailOptions = {
    from: `"DE BLISS" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
