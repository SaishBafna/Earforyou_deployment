import mongoose from "mongoose";

const ZhohocampainSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    instagram: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  { timestamps: true }
);

const Zhohocampain = mongoose.model("Zhohocampain", ZhohocampainSchema);
export default Zhohocampain;
