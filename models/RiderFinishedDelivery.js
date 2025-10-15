const mongoose = require("mongoose");

const RiderFinishedDeliverySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  riderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  contact: String,
  address: String,
  items: [
    {
      menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" },
      quantity: Number,
    },
  ],
});

module.exports = mongoose.model("RiderFinishedDelivery", RiderFinishedDeliverySchema);
