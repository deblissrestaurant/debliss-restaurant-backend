const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cron = require("node-cron");

// Load environment variables
require('dotenv').config({ path: __dirname + '/.env' });

const fetch = require("node-fetch"); // npm install node-fetch

const app = express();
const PORT = process.env.PORT || 3000;

// Example /health route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

// Self-ping every 10 minutes to prevent Render from spinning down
const pingUrl = `https://debliss-restaurant-backend.onrender.com/health`;
setInterval(async () => {
  try {
    const res = await fetch(pingUrl);
    if (res.ok) {
      console.log(`[Self-ping] Server alive at ${new Date().toLocaleTimeString()}`);
    } else {
      console.log(`[Self-ping] Ping failed with status: ${res.status}`);
    }
  } catch (err) {
    console.error("[Self-ping] Error:", err);
  }
}, 600000); // 600,000 ms = 10 minutes




// CORS configuration for production
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'https://debliss-restaurant.onrender.com',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Increase request size limits and add parameterLimit
app.use(express.json({ limit: "50mb", parameterLimit: 1000000 }));
app.use(
  express.urlencoded({ extended: true, limit: "50mb", parameterLimit: 1000000 })
);

const Order = require("./models/Order");
const Reservation = require("./models/Reservation");
const FinishedDelivery = mongoose.model(
  "FinishedDelivery",
  new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      userName: { type: String, required: true },
      items: [
        {
          menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" },
          quantity: Number,
        },
      ],
      contact: String,
      location: {
        name: String,
        lat: Number,
        lon: Number,
      },
      riderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      pending: String,
      confirmed: String,
      preparing: String,
      packing: String,
      outForDelivery: String,
    },
    { timestamps: true }
  )
);

const RiderFinishedDelivery = require("./models/RiderFinishedDelivery");
const uri = process.env.MONGO_URI || "mongodb+srv://DeBliss:RcmplIx9ocZSfkbk@cluster0.zl0of1q.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
mongoose
  .connect(uri)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

// SCHEMAS
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  phone: String,
  role: { type: String, enum: ["user", "admin", "rider"], default: "user" },
  resetToken: String,
  resetTokenExpiry: Date,
});

// Password hashing removed - passwords are now stored as plain text
// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();
//   this.password = await bcrypt.hash(this.password, 10);
//   next();
// });
// Method to compare password - now compares plain text passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
  return enteredPassword === this.password;
};

const User = mongoose.model("User", userSchema);

// Accompaniment Schema
const Accompaniment = mongoose.model(
  "Accompaniment",
  new mongoose.Schema({
    name: String,
    price: Number,
    category: String, // e.g., "soup", "sauce", "protein", "stew"
    available: { type: Boolean, default: true },
  })
);

const MenuItem = mongoose.model(
  "MenuItem",
  new mongoose.Schema({
    name: String,
    price: Number,
    category: String,
    available: { type: Boolean, default: true },
    image: { type: String }, // Optional field for future image implementation
    description: { type: String, default: "" }, // Optional description field
    allowedAccompaniments: [String], // Array of specific accompaniment IDs allowed for this item
  })
);

//Admin To Create Menu
// Backend: POST /admin/create-menu-item
// For debugging: You can log req.body here to inspect incoming data
app.post("/admin/create-menu-item", async (req, res) => {
  try {
    const { name, price, category, imageUrl, allowedAccompaniments } = req.body;

    if (!name || !price || !category) {
      return res
        .status(400)
        .json({ success: false, error: "Missing required fields" });
    }

    const newItemData = {
      name,
      price,
      category,
      allowedAccompaniments: allowedAccompaniments || [], // Array of accompaniment IDs
    };

    // Add image URL if provided
    if (imageUrl) {
      newItemData.image = imageUrl;
    }

    const newItem = new MenuItem(newItemData);

    await newItem.save();
    res.json({ success: true });
  } catch (err) {
    console.error("Error saving menu item:", err);
    res
      .status(500)
      .json({ success: false, error: "Server error while saving menu item" });
  }
});

// Check username availability endpoint
app.post("/check-username", async (req, res) => {
  const { username } = req.body;

  if (!username || username.length < 3) {
    return res.status(400).json({
      success: false,
      error: "Username must be at least 3 characters",
    });
  }

  try {
    // Check if username exists (case-insensitive)
    const existingUser = await User.findOne({
      name: { $regex: new RegExp("^" + username + "$", "i") },
    });

    res.json({
      success: true,
      available: !existingUser,
      message: existingUser
        ? "Username is already taken"
        : "Username is available",
    });
  } catch (error) {
    console.error("Username check error:", error);
    res.status(500).json({
      success: false,
      error: "Server error while checking username",
    });
  }
});

// ROUTES
app.post("/signup", async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password || !phone) {
    return res
      .status(400)
      .json({ success: false, error: "All fields are required" });
  }
  try {
    // Check for existing users (case-insensitive)
    const existing = await User.findOne({
      $or: [
        { email: { $regex: new RegExp("^" + email + "$", "i") } },
        { name: { $regex: new RegExp("^" + name + "$", "i") } },
      ],
    });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, error: "User already exists" });
    }

    const user = new User({ name, email, password, phone });
    await user.save();

    // Send welcome email
    try {
      const sendEmail = require("./utils/sendEmail");
      const welcomeEmailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
            .header { background: linear-gradient(135deg, #ff1200, #ff4000); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 32px; font-weight: bold; }
            .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
            .content { padding: 40px 30px; }
            .content h2 { color: #333; margin-bottom: 20px; font-size: 24px; }
            .content p { color: #666; line-height: 1.6; margin-bottom: 20px; }
            .features { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .features h3 { color: #ff1200; margin-bottom: 15px; }
            .features ul { margin: 0; padding-left: 20px; }
            .features li { color: #555; margin-bottom: 8px; }
            .cta { text-align: center; margin: 30px 0; }
            .cta a { background: linear-gradient(135deg, #ff1200, #ff4000); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block; }
            .footer { background-color: #333; color: white; text-align: center; padding: 20px; }
            .footer p { margin: 5px 0; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to DE BLISS!</h1>
              <p>Serving love in every dish</p>
            </div>
            <div class="content">
              <h2>Hello ${name}! 👋</h2>
              <p>Welcome to the DE BLISS family! We're thrilled to have you join our community of food lovers who appreciate authentic flavors and exceptional dining experiences.</p>
              
              <div class="features">
                <h3>What you can do with your account:</h3>
                <ul>
                  <li>🍽️ Browse our signature menu with 50+ delicious dishes</li>
                  <li>🛒 Place orders for delivery or pickup</li>
                  <li>📅 Make table reservations for special occasions</li>
                  <li>⭐ Rate and review your favorite meals</li>
                  <li>🎁 Get exclusive offers and early access to new dishes</li>
                  <li>📱 Enjoy our mobile-optimized ordering experience</li>
                </ul>
              </div>
              
              <p>Our team of passionate chefs is ready to serve you authentic Ghanaian cuisine made with the finest ingredients and lots of love.</p>
              
              <div class="cta">
                <a href="https://deblissfh.me">Start Ordering Now</a>
              </div>
              
              <p>If you have any questions or need assistance, feel free to reach out to our friendly customer support team.</p>
              
              <p>Thank you for choosing DE BLISS. We can't wait to serve you!</p>
            </div>
            <div class="footer">
              <p><strong>DE BLISS Restaurant</strong></p>
              <p>Serving 10K+ happy customers with love and tradition</p>
              <p>Contact us: debliss2024@gmail.com | Phone: +233 25 628 6634</p>
            </div>
          </div>
        </body>
        </html>
      `;

      await sendEmail(
        email,
        "🎉 Welcome to DE BLISS - Your culinary journey begins!",
        welcomeEmailHtml
      );
      console.log(`Welcome email sent to ${email}`);
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError);
      // Don't fail the registration if email fails
    }

    const token = require("./utils/generateToken")(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  const { identifier, password } = req.body;
  console.log("Login attempt:", { identifier, password: "***" }); // Debug log

  try {
    // Make login case-insensitive for better UX
    const user = await User.findOne({
      $or: [
        { email: { $regex: new RegExp("^" + identifier + "$", "i") } },
        { name: { $regex: new RegExp("^" + identifier + "$", "i") } },
      ],
    });

    console.log(
      "User found:",
      user
        ? { name: user.name, email: user.email, role: user.role }
        : "No user found"
    ); // Debug log

    if (!user || !(await user.matchPassword(password))) {
      console.log("Password match failed"); // Debug log
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = require("./utils/generateToken")(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

const crypto = require("crypto");
const sendEmail = require("./utils/sendEmail");

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res
      .status(200)
      .json({ message: "If email exists, reset link sent." });
  }

  const token = Math.floor(100000 + Math.random() * 900000).toString();
  // Save token and expiry in user
  user.resetToken = token;
  user.resetTokenExpires = Date.now() + 3600000; // 1 hour
  await user.save();

  // Email the reset code
  try {
    await sendEmail(
      user.email,
      "Reset Password Code",
      `<p>Hello ${user.name},</p>
  <p>Your password reset code is: <strong>${token}</strong></p>
  <p>This code will expire in 1 hour.</p>
  <p>If you did not request a password reset, please ignore this email.</p>
  <p>Thank you!</p>`
    );
    res.json({ success: true, message: "Reset link sent" });
  } catch (err) {
    res.status(500).json({ error: "Email send failed" });
  }
});

app.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found." });

    if (!user.resetToken || Date.now() > user.resetTokenExpires) {
      return res.status(400).json({ error: "Invalid or expired token." });
    }

    user.password = newPassword; // This will be hashed in pre("save")
    user.resetToken = null;
    user.resetTokenExpires = null;
    await user.save();

    res.json({ success: true, message: "Password reset successful." });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ error: "Server error." });
  }
});

app.post("/verify-reset-code", async (req, res) => {
  const { email, code } = req.body;
  const user = await User.findOne({ email });

  if (
    !user ||
    user.resetToken !== code ||
    Date.now() > user.resetTokenExpires
  ) {
    return res.status(400).json({ error: "Invalid or expired code." });
  }

  res.json({ success: true, userId: user._id }); // You can optionally generate a temporary token here
});

app.get("/menu", async (req, res) => {
  try {
    const items = await MenuItem.find({ available: true });

    // Populate accompaniments for each menu item based on allowedAccompaniments IDs
    const menuWithAccompaniments = await Promise.all(
      items.map(async (item) => {
        const itemObj = item.toObject();

        if (
          itemObj.allowedAccompaniments &&
          itemObj.allowedAccompaniments.length > 0
        ) {
          // Get specific accompaniments by their IDs
          const accompaniments = await Accompaniment.find({
            _id: { $in: itemObj.allowedAccompaniments },
            available: { $ne: false },
          });
          itemObj.accompaniments = accompaniments;
        } else {
          itemObj.accompaniments = [];
        }

        return itemObj;
      })
    );

    res.json(menuWithAccompaniments);
  } catch (err) {
    console.error("Failed to fetch menu:", err);
    res.status(500).json({ error: "Failed to load menu" });
  }
});

app.get("/seed-menu", async (req, res) => {
  try {
    const items = [
      {
        name: "Banku with fresh Tilapia light soup",
        price: 100,
        category: "BANKU / AKPLE ZONE",
      },
      {
        name: "Banku with hot pepper and fried/ grilled Tilapia",
        price: 100,
        category: "BANKU / AKPLE ZONE",
      },
      {
        name: "Banku with hot pepper and fried chicken",
        price: 70,
        category: "BANKU / AKPLE ZONE",
      },
      {
        name: "Banku with Gbomanyana",
        price: 90,
        category: "BANKU / AKPLE ZONE",
      },
      {
        name: "Akple with fresh Tilapia light soup",
        price: 100,
        category: "BANKU / AKPLE ZONE",
      },
      {
        name: "Akple with hot pepper and fried/ grilled Tilapia",
        price: 100,
        category: "BANKU / AKPLE ZONE",
      },
      {
        name: "Akple with hot pepper and fried chicken",
        price: 70,
        category: "BANKU / AKPLE ZONE",
      },
      {
        name: "Akple with Gbomanyana",
        price: 90,
        category: "BANKU / AKPLE ZONE",
      },
      {
        name: "Eba with Ademe Mix with Okro",
        price: 75,
        category: "LOCAL MIX ZONE",
      },
      {
        name: "Boiled Yam with Kontomire/Garden Eggs/Egg Stews",
        price: 80,
        category: "LOCAL MIX ZONE",
      },
      {
        name: "Boiled Yam & Plantain with Kontomire/ Garden Eggss/Egg Stew",
        price: 90,
        category: "LOCAL MIX ZONE",
      },
      { name: "Gariforto", price: 85, category: "LOCAL MIX ZONE" },
      {
        name: "Banku/Akple with Okro (Beef, Salmon, Crab, Wele, Tilapia)",
        price: 100,
        category: "DE BLISS SPECIALS",
      },
      {
        name: "Loaded FriedRice (Fried Egg, Beef, Sausage, Chicken, Boiled Egg, Vegetables)",
        price: 100,
        category: "DE BLISS SPECIALS",
      },
      {
        name: "Loaded Jollof (Fried Egg, Beef, Sausage, Chicken, Boiled Egg)",
        price: 100,
        category: "DE BLISS SPECIALS",
      },
      { name: "Superb Jollof", price: 85, category: "JOLLOF ZONE" },
      { name: "Beef Jollof", price: 90, category: "JOLLOF ZONE" },
      { name: "Beef Sauce With Jollof", price: 95, category: "JOLLOF ZONE" },
      { name: "Chicken Sauce With Jollof", price: 95, category: "JOLLOF ZONE" },
      {
        name: "Jollof Rice With Grilled Chicken",
        price: 75,
        category: "JOLLOF ZONE",
      },
      { name: "Jollof With Fish", price: 75, category: "JOLLOF ZONE" },
      {
        name: "Assorted Jollof With Fried Chicken",
        price: 90,
        category: "ASSORTED ZONE",
      },
      {
        name: "Assorted Jollof With Grilled Chicken",
        price: 90,
        category: "ASSORTED ZONE",
      },
      {
        name: "Assorted Fried Rice With Fried Chicken",
        price: 90,
        category: "ASSORTED ZONE",
      },
      {
        name: "Assorted Fried Rice With Grilled Chicken",
        price: 90,
        category: "ASSORTED ZONE",
      },
      { name: "Assorted Noodles", price: 80, category: "ASSORTED ZONE" },
      { name: "Assorted Spaghetti", price: 80, category: "ASSORTED ZONE" },
      {
        name: "Egg Fried Rice With Fried Chicken",
        price: 75,
        category: "FRIED RICE ZONE",
      },
      {
        name: "Egg Fried Rice With Grilled Chicken",
        price: 75,
        category: "FRIED RICE ZONE",
      },
      {
        name: "Egg Fried Rice With Chicken Sauce",
        price: 85,
        category: "FRIED RICE ZONE",
      },
      {
        name: "Egg Fried Rice With Beef Sauce",
        price: 90,
        category: "FRIED RICE ZONE",
      },
      {
        name: "Egg Fried Rice With Fish",
        price: 75,
        category: "FRIED RICE ZONE",
      },
      { name: "Vegetables Fried Rice", price: 60, category: "FRIED RICE ZONE" },
      {
        name: "Plain Rice With Kontomire",
        price: 85,
        category: "PLAIN RICE ZONE",
      },
      {
        name: "Plain Rice With Egg Stew",
        price: 85,
        category: "PLAIN RICE ZONE",
      },
      {
        name: "Plain Rice With Vegetable",
        price: 85,
        category: "PLAIN RICE ZONE",
      },
      {
        name: "Yam chips With Fried Chicken",
        price: 70,
        category: "FRIES ZONE",
      },
      {
        name: "Yam Chips With Grilled Chicken",
        price: 70,
        category: "FRIES ZONE",
      },
      {
        name: "French Fries With Fried Chicken",
        price: 80,
        category: "FRIES ZONE",
      },
      {
        name: "French Fries With Grilled Chicken",
        price: 70,
        category: "FRIES ZONE",
      },
      { name: "Vegetable Shawarma", price: 70, category: "SHAWARMA ZONE" },
      { name: "Chicken Shawarma", price: 75, category: "SHAWARMA ZONE" },
      { name: "Beef Shawarma", price: 80, category: "SHAWARMA ZONE" },
      { name: "Mix Shawarma", price: 90, category: "SHAWARMA ZONE" },
      { name: "Vegetable Salad", price: 70, category: "SALAD ZONE" },
      { name: "Potato Salad", price: 80, category: "SALAD ZONE" },
      { name: "Chicken Salad", price: 880, category: "SALAD ZONE" },
      { name: "Samosa", price: 15, category: "SALAD ZONE" },
      { name: "Spring rolls", price: 15, category: "SALAD ZONE" },
      { name: "Couscous", price: 25, category: "SALAD ZONE" },
      { name: "Extra Okro Soup", price: 60, category: "EXTRA ZONE" },
      { name: "Extra Ademe Soup", price: 60, category: "EXTRA ZONE" },
      { name: "Extra Aborbi Tadi", price: 70, category: "EXTRA ZONE" },
      { name: "Extra Totonyanya", price: 80, category: "EXTRA ZONE" },
      { name: "Extra Detsiffuiffui", price: 80, category: "EXTRA ZONE" },
      { name: "Extra Gbomanyanya", price: 80, category: "EXTRA ZONE" },
      { name: "Extra Equishie Stew", price: 70, category: "EXTRA ZONE" },
      { name: "Extra Palava Sauce Stew", price: 60, category: "EXTRA ZONE" },
      { name: "Extra Garden Eggs Stew", price: 60, category: "EXTRA ZONE" },
      { name: "Extra Egg Stew", price: 60, category: "EXTRA ZONE" },
      { name: "Extra Vegetable Stew", price: 60, category: "EXTRA ZONE" },
      { name: "Extra Chicken Sauce", price: 70, category: "EXTRA ZONE" },
      { name: "Extra Beef Sauce", price: 70, category: "EXTRA ZONE" },
      { name: "Extra Banku", price: 5, category: "EXTRA ZONE" },
      { name: "Extra Akpele", price: 5, category: "EXTRA ZONE" },
      { name: "Extra Boiled Yam", price: 30, category: "EXTRA ZONE" },
      { name: "Extra Boiled Plantain", price: 30, category: "EXTRA ZONE" },
      { name: "Extra Fish", price: 20, category: "EXTRA ZONE" },
      { name: "Extra Tilapia Half", price: 40, category: "EXTRA ZONE" },
      { name: "Extra Beef", price: 25, category: "EXTRA ZONE" },
      { name: "Extra Wele", price: 15, category: "EXTRA ZONE" },
      { name: "Extra Crab", price: 15, category: "EXTRA ZONE" },
      { name: "Extra Egg", price: 10, category: "EXTRA ZONE" },
      { name: "Extra Chicken", price: 30, category: "EXTRA ZONE" },
      { name: "Extra Pepper", price: 5, category: "EXTRA ZONE" },
      { name: "Extra Vegetable", price: 15, category: "EXTRA ZONE" },
      { name: "Extra Plain Rice", price: 30, category: "EXTRA ZONE" },
      { name: "Extra Jollof", price: 35, category: "EXTRA ZONE" },
      { name: "Extra Fried Rice", price: 35, category: "EXTRA ZONE" },
      { name: "Extra Coleslaw", price: 5, category: "EXTRA ZONE" },
    ];

    // Add default image if not present
    const itemsWithImage = items.map((item) => ({
      ...item,
      image: "",
    }));

    // Insert only if not already present (by name)
    for (const item of itemsWithImage) {
      const exists = await MenuItem.findOne({ name: item.name });
      if (!exists) {
        await MenuItem.create(item);
      }
    }

    const allMenu = await MenuItem.find();
    res.json({ message: "Menu seeded!", menu: allMenu });
  } catch (err) {
    res.status(500).json({ error: "Failed to seed menu" });
  }
});

// Accompaniment Endpoints
app.get("/accompaniments", async (req, res) => {
  try {
    const accompaniments = await Accompaniment.find({ available: true });
    res.json(accompaniments);
  } catch (err) {
    console.error("Failed to fetch accompaniments:", err);
    res.status(500).json({ error: "Failed to load accompaniments" });
  }
});

app.post("/admin/create-accompaniment", async (req, res) => {
  try {
    const { name, price, category } = req.body;

    if (!name || !price || !category) {
      return res
        .status(400)
        .json({ success: false, error: "Missing required fields" });
    }

    const newAccompaniment = new Accompaniment({
      name,
      price: parseFloat(price),
      category,
    });

    await newAccompaniment.save();
    res.json({ success: true, accompaniment: newAccompaniment });
  } catch (err) {
    console.error("Error creating accompaniment:", err);
    res.status(500).json({
      success: false,
      error: "Server error while creating accompaniment",
    });
  }
});

app.post("/admin/update-accompaniment", async (req, res) => {
  try {
    const { id, name, price, category, available } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (category !== undefined) updateData.category = category;
    if (available !== undefined) updateData.available = available;

    const updated = await Accompaniment.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, error: "Accompaniment not found" });
    }

    res.json({ success: true, accompaniment: updated });
  } catch (err) {
    console.error("Error updating accompaniment:", err);
    res.status(500).json({
      success: false,
      error: "Server error while updating accompaniment",
    });
  }
});

app.delete("/admin/delete-accompaniment/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Accompaniment.findByIdAndDelete(id);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, error: "Accompaniment not found" });
    }

    res.json({ success: true, message: "Accompaniment deleted successfully" });
  } catch (err) {
    console.error("Error deleting accompaniment:", err);
    res.status(500).json({
      success: false,
      error: "Server error while deleting accompaniment",
    });
  }
});

app.post("/seed-accompaniments", async (req, res) => {
  try {
    // Clear existing accompaniments
    await Accompaniment.deleteMany({});

    const accompaniments = [
      // Soups - only the ones that were actually used with Banku/Akple
      { name: "Okro soup", price: 70, category: "soup" },
      { name: "Ademe soup", price: 70, category: "soup" },
      { name: "Ademe mix with Okro soup", price: 70, category: "soup" },
      { name: "Fresh Tilapia light soup", price: 100, category: "soup" },
      { name: "Egushie soup", price: 80, category: "soup" }, // Used with Eba

      // Sauces - only the ones that were actually used
      { name: "Aborbi tadi", price: 80, category: "sauce" },
      { name: "Hot pepper", price: 0, category: "sauce" }, // Used in combo dishes
      { name: "Gbomanyana", price: 90, category: "sauce" },

      // Stews - for Boiled Yam/Plantain/Eba
      { name: "Kontomire Stew", price: 80, category: "stew" },
      { name: "Garden Eggs Stew", price: 60, category: "stew" },
      { name: "Egg Stew", price: 60, category: "stew" },

      // Proteins - for Atseke and other customizable items
      { name: "Fried Tilapia", price: 100, category: "protein" },
      { name: "Grilled Tilapia", price: 100, category: "protein" },
      { name: "Fried Chicken", price: 70, category: "protein" },
      { name: "Grilled Chicken", price: 70, category: "protein" },

      // Extras - minimal set
      { name: "Extra Vegetables", price: 15, category: "extra" },
      { name: "Extra Pepper", price: 5, category: "extra" },
    ];

    await Accompaniment.insertMany(accompaniments);

    const allAccompaniments = await Accompaniment.find();
    res.json({
      message: "Accompaniments seeded!",
      accompaniments: allAccompaniments,
    });
  } catch (err) {
    console.error("Failed to seed accompaniments:", err);
    res.status(500).json({ error: "Failed to seed accompaniments" });
  }
});

app.post("/seed-accurate-menu", async (req, res) => {
  try {
    // Clear existing menu items
    await MenuItem.deleteMany({});

    // Get all available accompaniments
    const allAccompaniments = await Accompaniment.find({});

    // Helper function to find accompaniment IDs by name
    const findAccompanimentIds = (names) => {
      return names
        .map((name) => {
          const acc = allAccompaniments.find((a) => a.name === name);
          return acc ? acc._id.toString() : null;
        })
        .filter(Boolean);
    };

    const accurateMenu = [
      // BANKU - only accompaniments that were originally paired with it
      {
        name: "Banku",
        price: 5,
        category: "BANKU / AKPLE ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Aborbi tadi",
          "Ademe soup",
          "Okro soup",
          "Ademe mix with Okro soup",
          "Fresh Tilapia light soup",
          "Hot pepper",
          "Gbomanyana",
        ]),
      },
      // AKPLE - same accompaniments as Banku based on menu.txt
      {
        name: "Akple",
        price: 5,
        category: "BANKU / AKPLE ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Aborbi tadi",
          "Ademe soup",
          "Okro soup",
          "Ademe mix with Okro soup",
          "Fresh Tilapia light soup",
          "Hot pepper",
          "Gbomanyana",
        ]),
      },
      // ATSEKE - only paired with proteins in menu.txt
      {
        name: "Atseke",
        price: 30,
        category: "LOCAL MIX ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Fried Tilapia",
          "Fried Chicken",
          "Grilled Tilapia",
          "Grilled Chicken",
        ]),
      },
      // EBA - only paired with these soups in menu.txt
      {
        name: "Eba",
        price: 20,
        category: "LOCAL MIX ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Egushie soup",
          "Okro soup",
          "Ademe soup",
          "Ademe mix with Okro soup",
        ]),
      },
      // BOILED YAM - only paired with stews in menu.txt
      {
        name: "Boiled Yam",
        price: 30,
        category: "LOCAL MIX ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Kontomire Stew",
          "Garden Eggs Stew",
          "Egg Stew",
        ]),
      },
      // BOILED PLANTAIN - only paired with stews in menu.txt
      {
        name: "Boiled Plantain",
        price: 30,
        category: "LOCAL MIX ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Kontomire Stew",
          "Garden Eggs Stew",
          "Egg Stew",
        ]),
      },
      // BOILED YAM & PLANTAIN - only paired with stews in menu.txt
      {
        name: "Boiled Yam & Plantain",
        price: 50,
        category: "LOCAL MIX ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Kontomire Stew",
          "Garden Eggs Stew",
          "Egg Stew",
        ]),
      },
      // JOLLOF RICE - only paired with grilled chicken in menu.txt
      {
        name: "Jollof Rice",
        price: 40,
        category: "JOLLOF ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds(["Grilled Chicken"]),
      },
      // JOLLOF - only paired with fish in menu.txt
      {
        name: "Jollof",
        price: 40,
        category: "JOLLOF ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds(["Fish"]),
      },
      // BEEF SAUCE - only paired with jollof in menu.txt
      {
        name: "Beef Sauce",
        price: 70,
        category: "JOLLOF ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds(["Jollof Rice"]),
      },
      // CHICKEN SAUCE - only paired with jollof in menu.txt
      {
        name: "Chicken Sauce",
        price: 70,
        category: "JOLLOF ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds(["Jollof Rice"]),
      },
      // ASSORTED JOLLOF - only paired with chicken in menu.txt
      {
        name: "Assorted Jollof",
        price: 60,
        category: "ASSORTED ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Fried Chicken",
          "Grilled Chicken",
        ]),
      },
      // ASSORTED FRIED RICE - only paired with chicken in menu.txt
      {
        name: "Assorted Fried Rice",
        price: 60,
        category: "ASSORTED ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Fried Chicken",
          "Grilled Chicken",
        ]),
      },
      // EGG FRIED RICE - paired with multiple items in menu.txt
      {
        name: "Egg Fried Rice",
        price: 45,
        category: "FRIED RICE ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Fried Chicken",
          "Grilled Chicken",
          "Chicken Sauce",
          "Beef Sauce",
          "Fish",
        ]),
      },
      // PLAIN RICE - only paired with these in menu.txt
      {
        name: "Plain Rice",
        price: 30,
        category: "PLAIN RICE ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Kontomire Stew",
          "Egg Stew",
          "Vegetable Stew",
        ]),
      },
      // YAM CHIPS - only paired with chicken in menu.txt
      {
        name: "Yam Chips",
        price: 40,
        category: "FRIES ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Fried Chicken",
          "Grilled Chicken",
        ]),
      },
      // FRENCH FRIES - only paired with chicken in menu.txt
      {
        name: "French Fries",
        price: 50,
        category: "FRIES ZONE",
        available: true,
        allowedAccompaniments: findAccompanimentIds([
          "Fried Chicken",
          "Grilled Chicken",
        ]),
      },

      // Complete dishes without accompaniments (as they appeared in menu.txt)
      {
        name: "Gariforto",
        price: 85,
        category: "LOCAL MIX ZONE",
        available: true,
      },
      {
        name: "Superb Jollof",
        price: 85,
        category: "JOLLOF ZONE",
        available: true,
      },
      {
        name: "Beef Jollof",
        price: 90,
        category: "JOLLOF ZONE",
        available: true,
      },
      {
        name: "Loaded FriedRice (Fried Egg, Beef, Sausage, Chicken, Boiled Egg, Vegetables)",
        price: 100,
        category: "DE BLISS SPECIALS",
        available: true,
      },
      {
        name: "Loaded Jollof (Fried Egg, Beef, Sausage, Chicken, Boiled Egg)",
        price: 100,
        category: "DE BLISS SPECIALS",
        available: true,
      },
      {
        name: "Assorted Noodles",
        price: 80,
        category: "ASSORTED ZONE",
        available: true,
      },
      {
        name: "Assorted Spaghetti",
        price: 80,
        category: "ASSORTED ZONE",
        available: true,
      },
      {
        name: "Vegetables Fried Rice",
        price: 60,
        category: "FRIED RICE ZONE",
        available: true,
      },
      {
        name: "Vegetable Shawarma",
        price: 70,
        category: "SHAWARMA ZONE",
        available: true,
      },
      {
        name: "Chicken Shawarma",
        price: 75,
        category: "SHAWARMA ZONE",
        available: true,
      },
      {
        name: "Beef Shawarma",
        price: 80,
        category: "SHAWARMA ZONE",
        available: true,
      },
      {
        name: "Mix Shawarma",
        price: 90,
        category: "SHAWARMA ZONE",
        available: true,
      },
      {
        name: "Vegetable Salad",
        price: 70,
        category: "SALAD ZONE",
        available: true,
      },
      {
        name: "Potato Salad",
        price: 80,
        category: "SALAD ZONE",
        available: true,
      },
      {
        name: "Chicken Salad",
        price: 80,
        category: "SALAD ZONE",
        available: true,
      },
      {
        name: "Samosa",
        price: 15,
        category: "SALAD ZONE",
        available: true,
      },
      {
        name: "Spring rolls",
        price: 15,
        category: "SALAD ZONE",
        available: true,
      },
      {
        name: "Couscous",
        price: 25,
        category: "SALAD ZONE",
        available: true,
      },
    ];

    // Filter out items with empty allowedAccompaniments arrays
    const cleanedMenu = accurateMenu.map((item) => {
      if (
        item.allowedAccompaniments &&
        item.allowedAccompaniments.length === 0
      ) {
        delete item.allowedAccompaniments;
      }
      return item;
    });

    await MenuItem.insertMany(cleanedMenu);

    const allMenu = await MenuItem.find();
    res.json({
      message: "Accurate menu with original accompaniment pairings created!",
      count: allMenu.length,
    });
  } catch (err) {
    console.error("Failed to seed accurate menu:", err);
    res.status(500).json({ error: "Failed to seed accurate menu" });
  }
});

app.post("/admin/update-price", async (req, res) => {
  const { id, price } = req.body;
  try {
    await MenuItem.findByIdAndUpdate(id, { price: parseFloat(price) });
    const updated = await MenuItem.find();
    res.json({ success: true, menuItems: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: "Update failed" });
  }
});

app.post("/admin/create-user", async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  // Validation
  if (!name || !email || !password || !role) {
    return res
      .status(400)
      .json({ success: false, error: "All fields are required" });
  }

  try {
    // Check if user already exists by name or email (case-insensitive)
    const existing = await User.findOne({
      $or: [
        { email: { $regex: new RegExp("^" + email + "$", "i") } },
        { name: { $regex: new RegExp("^" + name + "$", "i") } },
      ],
    });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, error: "User already exists" });
    }

    // Create and save new user (password will be hashed by pre-save hook)
    const newUser = new User({
      name,
      email,
      password, // Don't hash here - let the pre-save hook handle it
      phone,
      role, // "admin" or "rider"
    });

    await newUser.save();

    res.json({ success: true, user: newUser });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/order", async (req, res) => {
  const {
    userId,
    userName,
    items,
    contact,
    location,
    deliveryMethod,
    schedule,
  } = req.body;
  console.log("Received order data:", {
    userId,
    userName,
    items,
    contact,
    location,
    deliveryMethod,
    schedule,
  }); // Debug log
  try {
    // Convert lat/lon strings to numbers if they exist
    const processedLocation = location
      ? {
          ...location,
          lat: parseFloat(location.lat),
          lon: parseFloat(location.lon),
        }
      : location;

    // Process schedule data
    let processedSchedule = null;
    if (schedule && schedule.scheduledTime && schedule.scheduledDate) {
      processedSchedule = {
        scheduledTime: schedule.scheduledTime,
        scheduledDate: new Date(schedule.scheduledDate),
        scheduledFor: schedule.scheduledFor,
        isScheduled: true,
      };
    } else {
      processedSchedule = {
        scheduledTime: null,
        scheduledDate: null,
        scheduledFor: null,
        isScheduled: false,
      };
    }

    const newOrder = new Order({
      userId,
      userName,
      items,
      contact,
      location: processedLocation,
      deliveryMethod: deliveryMethod || "delivery",
      schedule: processedSchedule,
      pending: processedSchedule.isScheduled
        ? `⏰ Scheduled for ${processedSchedule.scheduledFor}`
        : "⌛ Pending Confirmation",
      confirmed: null,
      preparing: null,
      packing: null,
      outForDelivery: null,
    });
    console.log("Creating order with data:", newOrder); // Debug log
    const savedOrder = await newOrder.save();
    console.log("Order saved successfully:", savedOrder); // Debug log
    res.json({ success: true, order: savedOrder });
  } catch (error) {
    console.error("Failed to save order:", error);
    console.error("Error details:", error.message);
    res.status(500).json({ success: false, error: "Order failed" });
  }
});

app.get("/user-orders/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId })
      .populate("items.menuItem")
      .populate("riderId", "name phone");
    res.json(orders);
  } catch (error) {
    console.error("Failed to fetch user orders", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/user-finished-orders/:userId", async (req, res) => {
  try {
    const orders = await FinishedDelivery.find({ userId: req.params.userId })
      .populate("items.menuItem")
      .populate("riderId", "name phone");
    res.json(orders);
  } catch (err) {
    console.error("Failed to fetch finished orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Get specific order by ID for real-time updates
app.get("/user/order/:orderId", async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate("items.menuItem")
      .populate("riderId", "name phone");

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error("Failed to fetch order:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/admin/orders", async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("items.menuItem")
      .populate("userId", "name email phone")
      .populate("riderId", "name phone");
    res.json(orders);
  } catch (error) {
    console.error("Error fetching admin orders:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/admin/order-status", async (req, res) => {
  const { orderId, statusKey, value } = req.body;
  // ✅ Validate input
  const allowedFields = ["confirmed", "preparing", "packing", "outForDelivery"];
  if (!allowedFields.includes(statusKey)) {
    return res.status(400).json({ error: "Invalid status field" });
  }

  try {
    const update = {};
    update[statusKey] = value;

    // Get the order with user details before updating
    const order = await Order.findById(orderId).populate(
      "userId",
      "name email"
    );
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Update the order
    await Order.findByIdAndUpdate(orderId, { $set: update });

    // Send email notifications for specific status changes
    try {
      const sendEmail = require("./utils/sendEmail");

      if (statusKey === "confirmed" && value && order.userId?.email) {
        // Send order confirmation email
        const confirmationEmailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
              .header { background: linear-gradient(135deg, #ff1200, #ff4000); color: white; padding: 30px; text-align: center; }
              .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
              .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
              .content { padding: 30px; }
              .content h2 { color: #333; margin-bottom: 20px; font-size: 22px; }
              .content p { color: #666; line-height: 1.6; margin-bottom: 15px; }
              .order-info { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff1200; }
              .order-info h3 { color: #ff1200; margin-bottom: 10px; }
              .footer { background-color: #333; color: white; text-align: center; padding: 20px; }
              .footer p { margin: 5px 0; font-size: 14px; }
              .status-badge { background: #28a745; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; display: inline-block; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Order Confirmed! ✅</h1>
                <p>Your order is being prepared with love</p>
              </div>
              <div class="content">
                <h2>Hello ${order.userId.name}! 👋</h2>
                <p>Great news! Your order has been confirmed and our kitchen team is now preparing your delicious meal.</p>
                
                <div class="order-info">
                  <h3>Order Details:</h3>
                  <p><strong>Order ID:</strong> ${orderId}</p>
                  <p><strong>Status:</strong> <span class="status-badge">Confirmed</span></p>
                  <p><strong>Delivery Method:</strong> ${
                    order.deliveryMethod
                  }</p>
                  <p><strong>Contact:</strong> ${order.contact}</p>
                  ${
                    order.deliveryMethod === "delivery" && order.location
                      ? `<p><strong>Delivery Address:</strong> ${order.location.name}</p>`
                      : ""
                  }
                </div>
                
                <p>Your order is now in our kitchen where our skilled chefs are preparing it with the finest ingredients and lots of care.</p>
                
                <p><strong>What's next?</strong></p>
                <ul>
                  <li>🍳 Your meal is being prepared</li>
                  <li>📦 It will be packed securely</li>
                  ${
                    order.deliveryMethod === "delivery"
                      ? "<li>🚗 Our rider will deliver it to your location</li>"
                      : "<li>📍 You can pick it up at our restaurant</li>"
                  }
                  <li>📱 You'll receive updates throughout the process</li>
                </ul>
                
                <p>Thank you for choosing DE BLISS. We can't wait for you to enjoy your meal!</p>
              </div>
              <div class="footer">
                <p><strong>DE BLISS Restaurant</strong></p>
                <p>Contact us: debliss2024@gmail.com | Phone: +233 25 628 6634</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await sendEmail(
          order.userId.email,
          "🎉 Order Confirmed - DE BLISS is preparing your meal!",
          confirmationEmailHtml
        );
        console.log(
          `Order confirmation email sent to ${order.userId.email} for order ${orderId}`
        );
      }

      if (
        statusKey === "outForDelivery" &&
        value &&
        order.userId?.email &&
        order.deliveryMethod === "delivery"
      ) {
        // Send out for delivery email
        const deliveryEmailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
              .header { background: linear-gradient(135deg, #007BFF, #0056b3); color: white; padding: 30px; text-align: center; }
              .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
              .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
              .content { padding: 30px; }
              .content h2 { color: #333; margin-bottom: 20px; font-size: 22px; }
              .content p { color: #666; line-height: 1.6; margin-bottom: 15px; }
              .delivery-info { background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #007BFF; }
              .delivery-info h3 { color: #007BFF; margin-bottom: 10px; }
              .footer { background-color: #333; color: white; text-align: center; padding: 20px; }
              .footer p { margin: 5px 0; font-size: 14px; }
              .status-badge { background: #007BFF; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; display: inline-block; }
              .eta { background: #ff8c00; color: white; padding: 10px 20px; border-radius: 25px; font-weight: bold; text-align: center; margin: 15px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Your Order is On the Way! 🚗</h1>
                <p>Our rider is heading to your location</p>
              </div>
              <div class="content">
                <h2>Hello ${order.userId.name}! 👋</h2>
                <p>Exciting news! Your delicious meal has been prepared and packed, and our delivery rider is now on the way to your location.</p>
                
                <div class="delivery-info">
                  <h3>Delivery Details:</h3>
                  <p><strong>Order ID:</strong> ${orderId}</p>
                  <p><strong>Status:</strong> <span class="status-badge">Out for Delivery</span></p>
                  <p><strong>Delivery Address:</strong> ${
                    order.location?.name || "Your specified location"
                  }</p>
                  <p><strong>Contact:</strong> ${order.contact}</p>
                </div>
                
                <div class="eta">
                  <p style="margin: 0;">Estimated Delivery Time: 20-30 minutes</p>
                </div>
                
                <p><strong>What to expect:</strong></p>
                <ul>
                  <li>🚗 Our rider is en route to your location</li>
                  <li>📱 The rider will contact you upon arrival</li>
                  <li>🍽️ Your meal is packed securely and will arrive hot</li>
                  <li>💳 Payment will be collected upon delivery (if not paid online)</li>
                </ul>
                
                <p><strong>Contact Information:</strong></p>
                <p>If you need to reach our delivery team or make any changes, please contact us immediately at:</p>
                <p>📞 <strong>+233 25 628 6634</strong></p>
                
                <p>Thank you for choosing DE BLISS. Enjoy your meal!</p>
              </div>
              <div class="footer">
                <p><strong>DE BLISS Restaurant</strong></p>
                <p>Contact us: debliss2024@gmail.com | Phone: +233 25 628 6634</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await sendEmail(
          order.userId.email,
          "🚗 Your Order is Out for Delivery - DE BLISS",
          deliveryEmailHtml
        );
        console.log(
          `Delivery notification email sent to ${order.userId.email} for order ${orderId}`
        );
      }
    } catch (emailError) {
      console.error("Failed to send status update email:", emailError);
      // Don't fail the status update if email fails
    }

    res.json({ success: true, message: `Updated ${statusKey} to "${value}"` });
  } catch (err) {
    console.error("Failed to update status:", err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

app.get("/admin/rider-finished-deliveries", async (req, res) => {
  try {
    const deliveries = await RiderFinishedDelivery.find()
      .populate("userId", "name")
      .populate("riderId", "name phone")
      .populate("items.menuItem");
    res.json(deliveries);
  } catch (err) {
    console.error("Admin fetch error:", err);
    res.status(500).json({ error: "Failed to fetch finished deliveries" });
  }
});

app.get("/admin/finished-orders", async (req, res) => {
  try {
    const finishedOrders = await FinishedDelivery.find()
      .populate("userId", "name email phone")
      .populate("riderId", "name phone")
      .populate("items.menuItem");
    res.json(finishedOrders);
  } catch (error) {
    console.error("Error fetching finished orders:", error);
    res.status(500).json({ error: "Failed to fetch finished orders" });
  }
});

app.post("/admin/assign-rider", async (req, res) => {
  const { orderId, riderId } = req.body;

  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        riderId,
        outForDelivery: new Date(), // ✅ critical for rider dashboard filtering
      },
      { new: true }
    );

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error("Failed to assign rider:", err);
    res.status(500).json({ success: false, error: "Failed to assign rider" });
  }
});

app.get("/users/riders", async (req, res) => {
  try {
    const riders = await User.find({ role: "rider" });
    res.json(riders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch riders" });
  }
});

app.get("/admin/riders", async (req, res) => {
  try {
    const riders = await User.find({ role: "rider" }, "name _id phone");
    res.json(riders);
  } catch (err) {
    console.error("Failed to fetch riders:", err);
    res.status(500).json({ error: "Failed to fetch riders" });
  }
});

app.get("/rider/current-orders/:riderId", async (req, res) => {
  try {
    const riderObjectId = new mongoose.Types.ObjectId(req.params.riderId);
    const orders = await Order.find({ riderId: riderObjectId })
      .populate("userId", "name")
      .populate("items.menuItem");

    res.json(orders);
  } catch (err) {
    console.error("Error fetching rider current orders:", err);
    res.status(500).json({ error: "Failed to fetch current orders" });
  }
});

app.get("/rider/finished-orders/:riderId", async (req, res) => {
  try {
    const deliveries = await RiderFinishedDelivery.find({
      riderId: req.params.riderId,
    })
      .populate("userId", "name")
      .populate("items.menuItem");
    res.json(deliveries);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch finished orders" });
  }
});

app.delete("/admin/finished-orders/:orderId", async (req, res) => {
  try {
    const deleted = await FinishedDelivery.findByIdAndDelete(
      req.params.orderId
    );
    if (!deleted) return res.status(404).json({ message: "Order not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete failed:", error);
    res.status(500).json({ error: "Failed to delete finished order" });
  }
});

// Cancel unconfirmed order (admin only)
app.delete("/admin/cancel-order/:orderId", async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Check if order is already confirmed (prevent cancelling confirmed orders)
    if (order.confirmed) {
      return res.status(400).json({
        error: "Cannot cancel order that has already been confirmed",
      });
    }

    // Delete the order
    await Order.findByIdAndDelete(req.params.orderId);

    res.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).json({ error: "Failed to cancel order" });
  }
});

// Cancel unconfirmed order (user)
app.delete("/user/cancel-order/:orderId", async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Check if order is already confirmed (prevent cancelling confirmed orders)
    if (order.confirmed) {
      return res.status(400).json({
        error: "Cannot cancel order that has already been confirmed",
      });
    }

    // Delete the order
    await Order.findByIdAndDelete(req.params.orderId);

    res.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).json({ error: "Failed to cancel order" });
  }
});

//Admin Updating and Editing Menu Item
app.put("/admin/update-menu-item/:id", async (req, res) => {
  const { id } = req.params;
  const { name, price, category, imageUrl, allowedAccompaniments } = req.body;
  try {
    const updateFields = { name, price, category };
    if (imageUrl) {
      updateFields.image = imageUrl;
    }
    if (allowedAccompaniments !== undefined) {
      updateFields.allowedAccompaniments = allowedAccompaniments;
    }
    const updated = await MenuItem.findByIdAndUpdate(id, updateFields, {
      new: true,
    });
    if (!updated)
      return res.status(404).json({ success: false, error: "Item not found" });
    res.json({ success: true, item: updated });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, error: "Failed to update item" });
  }
});

app.delete("/admin/delete-menu-item/:id", async (req, res) => {
  try {
    const deleted = await MenuItem.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ success: false, error: "Item not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ success: false, error: "Failed to delete item" });
  }
});

// User marks order as finished (received)
app.post("/user/mark-finished", async (req, res) => {
  const { orderId } = req.body;
  console.log("Received request to mark order as finished:", orderId);

  try {
    const order = await Order.findById(orderId)
      .populate("userId")
      .populate("riderId")
      .populate("items.menuItem");

    if (!order) {
      console.log("Order not found");
      return res.status(404).json({ error: "Order not found" });
    }

    const finished = new FinishedDelivery({
      userId: order.userId._id,
      userName: order.userId.name,
      riderId: order.riderId?._id,
      contact: order.contact,
      address: order.address,
      items: order.items,
      pending: order.pending,
      confirmed: order.confirmed,
      preparing: order.preparing,
      packing: order.packing,
      outForDelivery: order.outForDelivery,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });
    await finished.save();

    if (order.riderId) {
      const RiderFinishedDeliveryModel = mongoose.model(
        "RiderFinishedDelivery"
      );
      const riderFinished = new RiderFinishedDeliveryModel({
        userId: order.userId._id,
        userName: order.userId.name,
        riderId: order.riderId._id,
        contact: order.contact,
        address: order.address,
        items: order.items,
      });
      await riderFinished.save();
    }

    await Order.findByIdAndDelete(orderId);
    console.log("Order successfully moved to finished");

    res.json({
      success: true,
      message: "Order moved to finished orders for user and rider.",
    });
  } catch (err) {
    console.error("Error in mark-finished:", err);
    res.status(500).json({ error: "Failed to move order to finished" });
  }
});

// RESERVATION ENDPOINTS

// Create a new reservation
app.post("/reservation", async (req, res) => {
  try {
    const {
      numberOfTables,
      chairsPerTable,
      reservationDate,
      reservationTime,
      wholeRestaurant,
      customerName,
      customerEmail,
      customerPhone,
      specialRequests,
      userId,
    } = req.body;

    // Validation
    if (
      !customerName ||
      !customerEmail ||
      !customerPhone ||
      !reservationDate ||
      !reservationTime
    ) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format",
      });
    }

    // Date validation (must be future date)
    const selectedDate = new Date(reservationDate + "T" + reservationTime);
    const now = new Date();
    if (selectedDate <= now) {
      return res.status(400).json({
        success: false,
        error: "Reservation must be for a future date and time",
      });
    }

    // Check if the time slot is already booked (for whole restaurant bookings)
    if (wholeRestaurant) {
      const existingReservation = await Reservation.findOne({
        reservationDate,
        reservationTime,
        wholeRestaurant: true,
        status: { $in: ["pending", "confirmed"] },
      });

      if (existingReservation) {
        return res.status(400).json({
          success: false,
          error: "Whole restaurant is already booked for this time slot",
        });
      }
    }

    // Calculate total guests
    let totalGuests;
    if (wholeRestaurant) {
      totalGuests = 100; // Assume whole restaurant capacity
    } else {
      totalGuests = numberOfTables * chairsPerTable;
    }

    // Create reservation
    const reservation = new Reservation({
      numberOfTables: wholeRestaurant ? 0 : numberOfTables,
      chairsPerTable: wholeRestaurant ? 0 : chairsPerTable,
      reservationDate,
      reservationTime,
      wholeRestaurant,
      customerName,
      customerEmail,
      customerPhone,
      specialRequests: specialRequests || "",
      totalGuests,
      userId: userId || null,
    });

    await reservation.save();

    res.json({
      success: true,
      message: "Reservation created successfully",
      reservationId: reservation._id,
      reservation: {
        id: reservation._id,
        numberOfTables: reservation.numberOfTables,
        chairsPerTable: reservation.chairsPerTable,
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
        wholeRestaurant: reservation.wholeRestaurant,
        customerName: reservation.customerName,
        customerEmail: reservation.customerEmail,
        totalGuests: reservation.totalGuests,
        status: reservation.status,
        createdAt: reservation.createdAt,
      },
    });
  } catch (err) {
    console.error("Error creating reservation:", err);
    res.status(500).json({
      success: false,
      error: "Failed to create reservation",
    });
  }
});

// Get all reservations (admin endpoint)
app.get("/admin/reservations", async (req, res) => {
  try {
    const reservations = await Reservation.find()
      .sort({ createdAt: -1 })
      .populate("userId", "name email");

    res.json({
      success: true,
      reservations,
    });
  } catch (err) {
    console.error("Error fetching reservations:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch reservations",
    });
  }
});

// Get reservations by user ID
app.get("/user/reservations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const reservations = await Reservation.find({ userId }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      reservations,
    });
  } catch (err) {
    console.error("Error fetching user reservations:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user reservations",
    });
  }
});

// Update reservation status (admin endpoint)
app.post("/admin/reservation-status", async (req, res) => {
  try {
    const { reservationId, status } = req.body;

    if (!["pending", "confirmed", "cancelled", "completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status",
      });
    }

    const reservation = await Reservation.findByIdAndUpdate(
      reservationId,
      { status },
      { new: true }
    );

    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: "Reservation not found",
      });
    }

    res.json({
      success: true,
      message: "Reservation status updated successfully",
      reservation,
    });
  } catch (err) {
    console.error("Error updating reservation status:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update reservation status",
    });
  }
});

// Get reservation by ID
app.get("/reservation/:id", async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id).populate(
      "userId",
      "name email"
    );

    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: "Reservation not found",
      });
    }

    res.json({
      success: true,
      reservation,
    });
  } catch (err) {
    console.error("Error fetching reservation:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch reservation",
    });
  }
});

// Cancel a reservation
app.patch("/reservation/:id/cancel", async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);

    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: "Reservation not found",
      });
    }

    // Check if reservation can be cancelled (not already completed or cancelled)
    if (
      reservation.status === "completed" ||
      reservation.status === "cancelled"
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Cannot cancel a reservation that is already completed or cancelled",
      });
    }

    // Check if cancellation is within allowed time (1 hour before reservation)
    const reservationDateTime = new Date(
      reservation.reservationDate + "T" + reservation.reservationTime
    );
    const now = new Date();
    const oneHourBefore = new Date(
      reservationDateTime.getTime() - 60 * 60 * 1000
    );

    if (now >= oneHourBefore) {
      return res.status(400).json({
        success: false,
        error:
          "Cannot cancel reservation less than 1 hour before the scheduled time",
      });
    }

    // Update reservation status to cancelled
    reservation.status = "cancelled";
    await reservation.save();

    res.json({
      success: true,
      message: "Reservation cancelled successfully",
      reservation,
    });
  } catch (err) {
    console.error("Error cancelling reservation:", err);
    res.status(500).json({
      success: false,
      error: "Failed to cancel reservation",
    });
  }
});

// Cleanup job for finished orders older than 7 days
// Runs every day at 2:00 AM
cron.schedule("0 2 * * *", async () => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await FinishedDelivery.deleteMany({
      createdAt: { $lt: sevenDaysAgo },
    });

    console.log(
      `[${new Date().toISOString()}] Finished Orders Cleanup: Deleted ${
        result.deletedCount
      } finished orders older than 7 days`
    );
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Finished Orders Cleanup Error:`,
      error
    );
  }
});

console.log("🗄️ Finished orders cleanup job scheduled - runs daily at 2:00 AM");

// Health check endpoint for Railway
app.get("/", (req, res) => {
  res.status(200).json({
    status: "healthy",
    message: "DE BLISS Backend API is running",
    timestamp: new Date().toISOString(),
  });
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Backend running");
});
