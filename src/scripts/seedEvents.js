require('dotenv').config();
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const Event = require('../models/Event');
const Registration = require('../models/Registration');

const ADMIN_USER_ID = 'seed-admin';

const days = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const events = [
  {
    title: 'Morning Yoga for Beginners',
    description: 'Start your day with simple yoga poses for flexibility and focus.',
    mode: 'online',
    category: 'yoga',
    tags: ['yoga', 'wellness', 'beginner'],
        agenda: [
      { time: '07:00 AM', title: 'Warm-up', description: 'Gentle stretching and breathing.' },
      { time: '07:15 AM', title: 'Sun Salutations', description: 'Basic sequence for beginners.' },
      { time: '07:40 AM', title: 'Cool-down', description: 'Savasana and reflection.' }
    ],
    startAt: days(3),
    endAt: days(3),
    onlineUrl: 'https://meet.lifecraft.example/yoga-beginners',
    instructor: { name: 'Anita Sharma', bio: 'Certified yoga instructor, 10 years experience.' },
    price: { isPaid: false, amount: 0, currency: 'INR' },
    capacity: 100,
    coverImage: null,
    status: 'published'
  },
  {
    title: 'AI Tools for Productivity Workshop',
    description: 'Hands-on workshop covering the top AI tools to boost your daily workflow.',
    mode: 'online',
    category: 'technology',
    tags: ['ai', 'productivity'],
        agenda: [
      { time: '10:00 AM', title: 'Welcome & Intro', description: 'Meet the instructor and other attendees.' },
      { time: '10:15 AM', title: 'Session 1: AI Landscape', description: 'Overview of the current AI tool ecosystem.' },
      { time: '11:30 AM', title: 'Break', description: '15-minute coffee break.' },
      { time: '11:45 AM', title: 'Session 2: Hands-on', description: 'Practice with three popular tools.' },
      { time: '12:45 PM', title: 'Q&A + Wrap-up', description: 'Open questions and next steps.' }
    ],
    startAt: days(5),
    endAt: days(5),
    onlineUrl: 'https://meet.lifecraft.example/ai-productivity',
    instructor: { name: 'Rohit Verma', bio: 'Product engineer and AI enthusiast.' },
    price: { isPaid: true, amount: 499, currency: 'INR' },
    capacity: 50,
    status: 'published'
  },
  {
    title: 'Community Fitness Meetup',
    description: 'In-person fitness session — all levels welcome.',
    mode: 'offline',
    category: 'fitness',
    tags: ['fitness', 'community'],
    startAt: days(7),
    endAt: days(7),
    venue: { name: 'Green Park Grounds', address: 'Block C, Sector 15', city: 'Bengaluru', country: 'IN' },
    instructor: { name: 'Karan Mehta', bio: 'Certified fitness coach.' },
    price: { isPaid: false, amount: 0, currency: 'INR' },
    capacity: 40,
    status: 'published'
  },
  {
    title: 'Hybrid Nutrition Masterclass',
    description: 'Learn the basics of meal planning. Join online or in person.',
    mode: 'hybrid',
    category: 'nutrition',
    tags: ['nutrition', 'meal-prep'],
        agenda: [
      { time: '11:00 AM', title: 'Welcome', description: 'Overview of the session.' },
      { time: '11:15 AM', title: 'Macros 101', description: 'Understanding protein, carbs, fats.' },
      { time: '12:00 PM', title: 'Meal Prep Demo', description: 'Live cooking demonstration.' },
      { time: '12:45 PM', title: 'Q&A', description: 'Personalised advice.' }
    ],
    startAt: days(10),
    endAt: days(10),
    venue: { name: 'LifeCraft Studio', address: 'MG Road', city: 'Mumbai', country: 'IN' },
    onlineUrl: 'https://meet.lifecraft.example/nutrition',
    instructor: { name: 'Priya Nair', bio: 'Nutritionist and meal-planning expert.' },
    price: { isPaid: true, amount: 799, currency: 'INR' },
    capacity: 30,
    status: 'published'
  },
  {
    title: 'Mindfulness Meditation Session',
    description: 'Guided 45-minute meditation for stress relief.',
    mode: 'online',
    category: 'wellness',
    tags: ['meditation', 'mindfulness'],
    startAt: days(2),
    endAt: days(2),
    onlineUrl: 'https://meet.lifecraft.example/meditation',
    instructor: { name: 'Tara Iyer', bio: 'Mindfulness coach.' },
    price: { isPaid: false, amount: 0, currency: 'INR' },
    capacity: 200,
    status: 'published'
  },
  {
    title: 'Music Production Basics',
    description: 'Intro to beats, DAWs, and mixing for absolute beginners.',
    mode: 'online',
    category: 'music',
    tags: ['music', 'production'],
    startAt: days(14),
    endAt: days(14),
    onlineUrl: 'https://meet.lifecraft.example/music',
    instructor: { name: 'DJ Arjun', bio: 'Producer & sound designer.' },
    price: { isPaid: true, amount: 299, currency: 'INR' },
    capacity: 60,
    status: 'published'
  },
  {
    title: 'Startup Pitch Night',
    description: 'Watch early-stage founders pitch to a panel.',
    mode: 'offline',
    category: 'business',
    tags: ['startup', 'networking'],
    startAt: days(20),
    endAt: days(20),
    venue: { name: 'WeWork Galaxy', address: 'Residency Road', city: 'Bengaluru', country: 'IN' },
    instructor: { name: 'Panel TBA' },
    price: { isPaid: false, amount: 0, currency: 'INR' },
    capacity: 120,
    status: 'published'
  },
  {
    title: 'Weekend Photography Walk',
    description: 'Street photography walk with composition tips.',
    mode: 'offline',
    category: 'arts',
    tags: ['photography', 'arts'],
    startAt: days(9),
    endAt: days(9),
    venue: { name: 'Cubbon Park', address: 'Kasturba Road', city: 'Bengaluru', country: 'IN' },
    instructor: { name: 'Neha Kulkarni' },
    price: { isPaid: true, amount: 199, currency: 'INR' },
    capacity: 25,
    status: 'published'
  },
  {
    title: 'Introduction to Public Speaking',
    description: 'Overcome stage fear with practical exercises.',
    mode: 'online',
    category: 'personal-development',
    tags: ['speaking', 'communication'],
    startAt: days(6),
    endAt: days(6),
    onlineUrl: 'https://meet.lifecraft.example/speaking',
    instructor: { name: 'Sameer Khanna' },
    price: { isPaid: false, amount: 0, currency: 'INR' },
    capacity: 80,
    status: 'published'
  },
  {
    title: 'Digital Detox Challenge Kickoff',
    description: 'Join a 7-day digital detox challenge with daily check-ins.',
    mode: 'online',
    category: 'wellness',
    tags: ['detox', 'mindfulness'],
    startAt: days(1),
    endAt: days(8),
    onlineUrl: 'https://meet.lifecraft.example/detox',
    instructor: { name: 'LifeCraft Team' },
    price: { isPaid: false, amount: 0, currency: 'INR' },
    capacity: 500,
    status: 'published'
  },
  {
    title: 'Career Switch to Tech — AMA',
    description: 'Ask-me-anything with engineers who switched careers.',
    mode: 'online',
    category: 'career',
    tags: ['career', 'tech'],
    startAt: days(4),
    endAt: days(4),
    onlineUrl: 'https://meet.lifecraft.example/ama',
    instructor: { name: 'LifeCraft Mentors' },
    price: { isPaid: false, amount: 0, currency: 'INR' },
    capacity: 300,
    status: 'published'
  },
    {
    title: 'Tiny Test Event (Waitlist Demo)',
    description: 'Only 1 seat — for testing waitlist auto-promotion.',
    mode: 'online',
    category: 'testing',
    tags: ['test', 'waitlist'],
    startAt: days(5),
    endAt: days(5),
    onlineUrl: 'https://meet.lifecraft.example/tiny',
    instructor: { name: 'Test Host' },
    price: { isPaid: false, amount: 0, currency: 'INR' },
    capacity: 1,
    status: 'published'
  },
    {
    title: 'Reminder Test Event (24h away)',
    description: 'Starts in ~24 hours for testing the reminder job.',
    mode: 'online',
    category: 'testing',
    tags: ['reminder', 'test'],
    startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),   // exactly 24h from now
    endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
    onlineUrl: 'https://meet.lifecraft.example/reminder-test',
    instructor: { name: 'Test Host' },
    price: { isPaid: false, amount: 0, currency: 'INR' },
    capacity: 100,
    status: 'published'
  },
  {
    title: 'Advanced Yoga Flow',
    description: 'Draft event — only visible to admins.',
    mode: 'online',
    category: 'yoga',
    tags: ['yoga', 'advanced'],
    startAt: days(12),
    endAt: days(12),
    onlineUrl: 'https://meet.lifecraft.example/advanced-yoga',
    instructor: { name: 'Anita Sharma' },
    price: { isPaid: false, amount: 0, currency: 'INR' },
    capacity: 40,
    status: 'draft'
  }
];

async function run() {
  try {
    await connectDatabase(process.env.MONGO_URI);

    await Event.deleteMany({});
    await Registration.deleteMany({});
console.log('[seed] Cleared existing registrations');
    console.log('[seed] Cleared existing events');

    const withCreator = events.map((e) => ({ ...e, createdBy: ADMIN_USER_ID }));
    const inserted = await Event.insertMany(withCreator);
    console.log(`[seed] Inserted ${inserted.length} events`);

    await mongoose.disconnect();
    console.log('[seed] Done');
  } catch (err) {
    console.error('[seed] Failed:', err);
    process.exit(1);
  }
}

run();