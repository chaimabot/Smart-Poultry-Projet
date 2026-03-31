const mongoose = require("mongoose");

const DoorScheduleSchema = new mongoose.Schema(
  {
    poulaillerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
      unique: true, // One schedule per coop
    },
    openHour: {
      type: Number,
      min: 0,
      max: 23,
      default: 7,
    },
    openMinute: {
      type: Number,
      min: 0,
      max: 59,
      default: 0,
    },
    closeHour: {
      type: Number,
      min: 0,
      max: 23,
      default: 18,
    },
    closeMinute: {
      type: Number,
      min: 0,
      max: 59,
      default: 0,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DoorSchedule", DoorScheduleSchema);
