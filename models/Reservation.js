const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
  {
    numberOfTables: {
      type: Number,
      required: true,
      min: 1,
      max: 4,
    },
    chairsPerTable: {
      type: Number,
      required: true,
      min: 2,
      max: 6,
    },
    reservationDate: {
      type: String,
      required: true,
    },
    reservationTime: {
      type: String,
      required: true,
    },
    wholeRestaurant: {
      type: Boolean,
      default: false,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    customerPhone: {
      type: String,
      required: true,
      trim: true,
    },
    specialRequests: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    totalGuests: {
      type: Number,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // Can be null for non-registered customers
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
reservationSchema.index({ reservationDate: 1, reservationTime: 1 });
reservationSchema.index({ customerEmail: 1 });
reservationSchema.index({ status: 1 });

module.exports = mongoose.model("Reservation", reservationSchema);
