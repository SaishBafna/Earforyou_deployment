// import mongoose from "mongoose";
// import User from "../models/Users.js";

// export const watchUserChanges = () => {
//   try {
//     const changeStream = User.watch();

//     changeStream.on("change", async (change) => {
//       console.log("Change event detected:", change);

//       if (change.operationType === "update") {
//         const updatedFields = change.updateDescription.updatedFields;

//         if (updatedFields.userType === "RECEIVER") {
//           try {
//             const user = await User.findById(change.documentKey._id);
//             if (user) {
//               user.status = "Online";
//               await user.save();
//               console.log(`User ${user._id} is now Online (RECEIVER).`);
//             }
//           } catch (error) {
//             console.error("Error updating user status:", error);
//           }
//         }
//       }
//     });

//     changeStream.on("error", (error) => {
//       console.error("Change stream error:", error);
//     });

//     console.log("Change stream initialized.");
//   } catch (error) {
//     console.error("Error initializing watchUserChanges:", error);
//   }
// };
