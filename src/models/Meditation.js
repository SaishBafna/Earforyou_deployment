import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const MeditationSchema = new Schema({
    title: {
        type: String,
        required: true,
    },
    link: {
        type: String,
        required: true,
    },
    duration: {
        type: Number,
        required: true,
    },
});

const Meditation = model('Meditation', MeditationSchema);

export default Meditation;