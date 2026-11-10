#!/usr/bin/env python
"""Seed script: creates test users and challenges on all 13 categories.

Run from the api/ directory:
    python scripts/seed.py
"""

import random
import sys
from datetime import UTC, datetime

sys.path.insert(0, ".")

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.enums import Category, ChallengeSource, PriceVariant, StudyGroup, Visibility
from app.models import Challenge, ChallengeTask, User
from app.services.progress import completion_xp, task_xp

engine = create_engine(get_settings().database_url)


# ---------------------------------------------------------------------------
# Task generators — produce (title, instructions, proof_hint) per day
# ---------------------------------------------------------------------------

def _week_cycle(day: int, patterns: list[tuple[str, str, str]]) -> tuple[str, str, str]:
    """Pick a pattern by day-of-week, week number shifts intensity."""
    week = (day - 1) // 7
    idx = (day - 1) % len(patterns)
    title, instr, hint = patterns[idx]
    return title.format(day=day, week=week + 1), instr.format(day=day, week=week + 1), hint


def gen_tasks(day_patterns: list[tuple[str, str, str]], n: int) -> list[tuple[int, str, str, str]]:
    """Return [(day_number, title, instructions, proof_hint)] for n days."""
    return [
        (d, *_week_cycle(d, day_patterns))
        for d in range(1, n + 1)
    ]


# ---------------------------------------------------------------------------
# Challenge definitions
# ---------------------------------------------------------------------------

CHALLENGES: list[dict] = [

    # ── FITNESS ──────────────────────────────────────────────────────────
    dict(
        category=Category.FITNESS,
        title="30-Day Running Journey",
        description="Build a running habit from scratch with progressive daily runs. Each week gets a little longer — by day 30 you'll be running 5 km without stopping.",
        difficulty=2, duration_days=30,
        tasks=gen_tasks([
            ("Day {day}: Easy 20-min run", "Run at a conversational pace for 20 minutes. No stopping required — slow down if you need to breathe.", "Photo of your route on a map app or fitness tracker summary"),
            ("Day {day}: Interval sprints", "Alternate 1 min fast / 2 min slow for 20 minutes total.", "Fitness tracker screenshot showing heart rate spikes"),
            ("Day {day}: Long slow run", "Run at an easy pace for 30 minutes. Distance doesn't matter — time on feet does.", "Photo at a landmark along your route"),
            ("Day {day}: Hill repeats", "Find a hill and run up it 4 times. Jog back down each time.", "Photo of the hill you used"),
            ("Day {day}: Tempo run", "Run at a comfortably hard pace — you can speak only a few words — for 15 minutes.", "Fitness app showing average pace"),
            ("Day {day}: Recovery walk/jog", "Walk briskly or jog very slowly for 25 minutes. Focus on breathing.", "Photo during your walk or jog"),
            ("Day {day}: Stretch & mobility", "Do 15 minutes of runner's stretches: calves, hip flexors, quads, hamstrings.", "Photo of your stretching session"),
        ], 30),
    ),
    dict(
        category=Category.FITNESS,
        title="7-Day Morning Workout",
        description="A short daily workout before breakfast that takes just 15 minutes. No equipment needed — your bodyweight is enough.",
        difficulty=1, duration_days=7,
        tasks=[
            (1, "Day 1: Push-up foundation", "Do 3 sets of 10 push-ups with 60 s rest between sets. Modify on knees if needed.", "Photo showing your push-up position"),
            (2, "Day 2: Squat challenge", "Do 4 sets of 15 bodyweight squats. Keep your chest up and knees behind toes.", "Photo of squat position"),
            (3, "Day 3: Plank hold", "Hold a plank for as long as possible, 3 times. Rest 90 s between. Note your times.", "Photo in plank position"),
            (4, "Day 4: Lunges circuit", "Do 3 sets of 10 lunges per leg, alternating legs.", "Photo of lunge position"),
            (5, "Day 5: Full combo", "10 push-ups → 15 squats → 30 s plank, 3 rounds, no rest between exercises.", "Photo after completing the combo"),
            (6, "Day 6: Core blast", "3 rounds: 20 crunches, 15 leg raises, 30 s bicycle crunch.", "Photo of core exercise in progress"),
            (7, "Day 7: Cardio finisher", "10 burpees → 20 jumping jacks → 15 squats, 3 rounds.", "Photo or selfie after completing your 7-day streak"),
        ],
    ),

    # ── NUTRITION ─────────────────────────────────────────────────────────
    dict(
        category=Category.NUTRITION,
        title="14-Day Clean Eating Reset",
        description="Cut processed food and cook one clean meal every day. Simple ingredients, no calorie counting — just whole food.",
        difficulty=2, duration_days=14,
        tasks=gen_tasks([
            ("Day {day}: Veggie-loaded breakfast", "Make a breakfast with at least 2 servings of vegetables (omelette, smoothie bowl, or avocado toast with greens).", "Photo of your breakfast plate"),
            ("Day {day}: Protein-first lunch", "Build your lunch around a protein source (chicken, legumes, eggs, fish) with a side of raw or steamed veg.", "Photo of your lunch plate"),
            ("Day {day}: Cook from scratch", "Prepare a full dinner from whole ingredients — no packets, no sauces from a jar.", "Photo of your dinner ingredients laid out before cooking"),
            ("Day {day}: Hydration day", "Drink at least 2 L of water today. Add a lemon slice or mint if that helps.", "Photo of your water bottle showing the amount"),
            ("Day {day}: Snack swap", "Replace every processed snack today with nuts, fruit, or raw vegetables.", "Photo of your snack"),
            ("Day {day}: Colour plate", "Make a meal where every item on the plate is a different colour.", "Photo of your colourful plate"),
            ("Day {day}: Meal prep session", "Prep at least two portions of a healthy meal for tomorrow so you don't reach for junk.", "Photo of your prepped containers"),
        ], 14),
    ),
    dict(
        category=Category.NUTRITION,
        title="7-Day No Added Sugar",
        description="One week without added sugar — in drinks, snacks and meals. Natural sugars in fruit are fine. This challenge resets your taste buds.",
        difficulty=3, duration_days=7,
        tasks=[
            (1, "Day 1: Sugar audit", "Check every label you eat from today. Note how many items had added sugar you didn't expect.", "Photo of an ingredient list you found surprising"),
            (2, "Day 2: Drink check", "Replace every sweetened drink with water, sparkling water, or unsweetened tea/coffee.", "Photo of your drink(s) for the day"),
            (3, "Day 3: Breakfast without sugar", "Have a savoury or naturally sweet breakfast with zero added sugar.", "Photo of your breakfast"),
            (4, "Day 4: Sauce & condiment swap", "No ketchup, BBQ sauce, or sweet dressings. Use olive oil, lemon, mustard, or herbs.", "Photo of the condiments you used instead"),
            (5, "Day 5: Dessert alternative", "Make a dessert using only natural sweetness — banana ice cream, fruit salad, or baked apple.", "Photo of your dessert"),
            (6, "Day 6: Restaurant or takeaway", "Order a meal out with no added sugar in any dish. Ask if needed.", "Photo of your meal"),
            (7, "Day 7: Full sugar-free day", "Complete a full day — all three meals and snacks — with zero added sugar.", "Photo of everything you ate today laid out together"),
        ],
    ),

    # ── MINDFULNESS ───────────────────────────────────────────────────────
    dict(
        category=Category.MINDFULNESS,
        title="30-Day Meditation Journey",
        description="Start with 5 minutes and build to 20 minutes by the end. No experience needed — just sit, breathe, and observe.",
        difficulty=1, duration_days=30,
        tasks=gen_tasks([
            ("Day {day}: Breath focus ({week}0 min)", "Sit comfortably, close your eyes, and focus on your breath for {week}0 minutes. When your mind wanders, gently return.", "Selfie in your meditation spot after the session"),
            ("Day {day}: Body scan", "Lie down and scan your body from feet to head, noticing any tension. Hold for {week}0 minutes.", "Photo of your meditation space"),
            ("Day {day}: Loving-kindness", "Spend {week}0 minutes sending positive wishes to yourself, then to others.", "Journal entry with one insight from the session"),
            ("Day {day}: Walking meditation", "Walk slowly for {week}0 minutes, fully aware of each step and breath.", "Photo of your walking route"),
            ("Day {day}: Gratitude sit", "Sit quietly for {week}0 minutes and bring three things you are grateful for to mind.", "Written list of your three gratitude points"),
            ("Day {day}: Open awareness", "Sit for {week}0 minutes noticing sounds, sensations and thoughts without judging them.", "Brief journal note on what you noticed"),
            ("Day {day}: Breath counting", "Count your breaths from 1 to 10, then restart, for {week}0 minutes.", "Selfie after the session"),
        ], 30),
    ),
    dict(
        category=Category.MINDFULNESS,
        title="7-Day Journaling Sprint",
        description="Write for 10 minutes every day this week. Each day has a different prompt to explore your thoughts and feelings.",
        difficulty=1, duration_days=7,
        tasks=[
            (1, "Day 1: Who am I right now?", "Write freely for 10 minutes about where you are in life at this moment — not where you want to be, where you are.", "Photo of your open journal page (can be blurred for privacy)"),
            (2, "Day 2: What drains me?", "List every activity, habit or relationship that leaves you feeling depleted. Reflect on one of them.", "Photo of your journal"),
            (3, "Day 3: What energises me?", "List everything that fills you with energy or joy. What patterns do you notice?", "Photo of your journal"),
            (4, "Day 4: Letter to past self", "Write a letter to yourself five years ago. What would you say?", "Photo of your journal"),
            (5, "Day 5: Fear inventory", "What are your three biggest fears right now? Write about where they come from.", "Photo of your journal"),
            (6, "Day 6: Future self", "Describe your life five years from now in vivid detail — where you live, who is around, what you do.", "Photo of your journal"),
            (7, "Day 7: One commitment", "Review the week's entries. Write one specific commitment you will carry forward.", "Photo of your commitment written clearly"),
        ],
    ),

    # ── SLEEP ─────────────────────────────────────────────────────────────
    dict(
        category=Category.SLEEP,
        title="14-Day Sleep Routine",
        description="Build a consistent sleep schedule and wind-down routine over two weeks. By day 14 falling asleep should feel effortless.",
        difficulty=2, duration_days=14,
        tasks=gen_tasks([
            ("Day {day}: Set your sleep window", "Pick a fixed bedtime and wake-up time. Set alarms for both. Stick to them today, even on a day off.", "Screenshot of your two alarms set"),
            ("Day {day}: Screen curfew", "Turn off all screens 60 minutes before bedtime. Use that time for reading or stretching instead.", "Photo of your phone face-down at your chosen cut-off time"),
            ("Day {day}: Wind-down ritual", "Spend 20 minutes before bed doing something calming: tea, light reading, or stretching.", "Photo of your wind-down setup"),
            ("Day {day}: Dark and cool room", "Make your bedroom as dark as possible and drop the temperature to 18–20 °C.", "Photo of your bedroom setup"),
            ("Day {day}: Log your sleep", "Write down when you went to bed, when you fell asleep (estimate), and when you woke up.", "Photo of your sleep log entry"),
            ("Day {day}: Morning light", "Get outside or sit by a window within 30 minutes of waking. 10 minutes of natural light.", "Selfie in natural morning light"),
            ("Day {day}: No caffeine after 2 pm", "Skip all caffeine from 2 pm onwards. Note how it affects your evening.", "Photo of your last coffee/tea before the cutoff"),
        ], 14),
    ),

    # ── LEARNING ──────────────────────────────────────────────────────────
    dict(
        category=Category.LEARNING,
        title="30-Day Coding Challenge",
        description="Write code every day for 30 days. Start with fundamentals and build toward a small project. Any language, any skill level.",
        difficulty=3, duration_days=30,
        tasks=gen_tasks([
            ("Day {day}: Code for 30 min", "Write code for at least 30 minutes. Work on a tutorial, a problem, or your project.", "Screenshot of your code editor with today's work"),
            ("Day {day}: Learn one concept", "Pick one concept you don't understand well. Read about it and write a small example.", "Screenshot of your example code running"),
            ("Day {day}: Fix a bug", "Find a bug in your code or in an open exercise. Fix it and explain what was wrong.", "Screenshot showing the fix and the working result"),
            ("Day {day}: Code review", "Read someone else's code (GitHub, blog post, tutorial). Note three things you learned.", "Screenshot of the code you reviewed with your notes"),
            ("Day {day}: Build a small feature", "Add one small feature or function to a project. Commit it.", "Screenshot of your git commit or the working feature"),
            ("Day {day}: Refactor", "Take something you wrote earlier and make it cleaner, shorter, or faster.", "Screenshot of before and after"),
            ("Day {day}: Teach it back", "Write a brief note explaining what you built or learned this week in plain words.", "Photo of your note or screenshot of a written explanation"),
        ], 30),
    ),
    dict(
        category=Category.LEARNING,
        title="7-Day Language Starter",
        description="Spend 20 focused minutes every day learning a new language. By the end of the week you will know 100 words and basic phrases.",
        difficulty=2, duration_days=7,
        tasks=[
            (1, "Day 1: 50 core words", "Learn 50 of the most common words in your target language. Use flashcards or a spaced repetition app.", "Screenshot of your app progress or photo of your flashcards"),
            (2, "Day 2: Greetings and introductions", "Learn how to say hello, goodbye, please, thank you, and introduce yourself.", "Short selfie video or written note with the phrases"),
            (3, "Day 3: Numbers 1–100", "Learn to count to 100 and understand prices in your target language.", "Screenshot of a practice quiz score"),
            (4, "Day 4: Listen for 20 min", "Listen to a podcast, song, or TV show in the target language. No subtitles.", "Screenshot or photo showing what you watched/listened to"),
            (5, "Day 5: Simple sentences", "Build 10 sentences using words you have already learned. Write them down.", "Photo of your 10 sentences"),
            (6, "Day 6: Talk to someone", "Find a native speaker online (Tandem, HelloTalk) or use an AI app to have a 5-min chat.", "Screenshot of the conversation (you can blur personal info)"),
            (7, "Day 7: Review and quiz", "Quiz yourself on everything from the week. Aim for 80 % accuracy.", "Screenshot of your quiz results"),
        ],
    ),

    # ── READING ───────────────────────────────────────────────────────────
    dict(
        category=Category.READING,
        title="30-Day Reading Habit",
        description="Read for 20 minutes every day. By the end of the month you will have finished at least one book and built a lasting habit.",
        difficulty=1, duration_days=30,
        tasks=gen_tasks([
            ("Day {day}: Read 20 minutes", "Read your book for at least 20 uninterrupted minutes. Put your phone in another room.", "Photo of your book open to the page you reached"),
            ("Day {day}: Read and take notes", "Read for 20 minutes and write down one idea or quote that stood out.", "Photo of your note"),
            ("Day {day}: Read aloud", "Read one page or passage aloud. This improves comprehension and retention.", "Short video of you reading aloud (or photo if you prefer)"),
            ("Day {day}: Summary day", "After reading, write two or three sentences summarising what you read today.", "Photo of your written summary"),
            ("Day {day}: Highlight and annotate", "Read actively — underline or note at least five interesting passages.", "Photo of your highlighted pages"),
            ("Day {day}: Share a quote", "Pick the best quote from today's reading and share it (notes app, sticky note, anywhere).", "Photo of the quote you shared"),
            ("Day {day}: Reflect on the week", "In 5 minutes, write what you have taken from this week's reading.", "Photo of your reflection"),
        ], 30),
    ),

    # ── CREATIVITY ────────────────────────────────────────────────────────
    dict(
        category=Category.CREATIVITY,
        title="30-Day Drawing Challenge",
        description="Draw something every day, no matter how small. Start with simple shapes and work up to full illustrations. No artistic experience needed.",
        difficulty=2, duration_days=30,
        tasks=gen_tasks([
            ("Day {day}: Sketch anything", "Spend 10 minutes sketching whatever is in front of you. Don't erase — keep going.", "Photo of today's sketch"),
            ("Day {day}: Draw from observation", "Pick an object near you and draw it as accurately as you can in 15 minutes.", "Photo of your drawing next to the object"),
            ("Day {day}: Gestural drawing", "Set a 30-second timer and draw a simple pose or shape. Do this 10 times.", "Photo of your gesture drawings on one page"),
            ("Day {day}: Experiment with shading", "Take a simple shape and practise shading it from light to dark.", "Photo of your shading exercise"),
            ("Day {day}: Draw from memory", "Think of a place, animal or object you know well and draw it without looking.", "Photo of your memory drawing"),
            ("Day {day}: Doodle freely", "Set a 10-minute timer and doodle whatever comes to mind with no plan.", "Photo of your doodle page"),
            ("Day {day}: Colour it", "Take one of this week's drawings and add colour — pencils, pens, or digital.", "Photo of your coloured drawing"),
        ], 30),
    ),
    dict(
        category=Category.CREATIVITY,
        title="7-Day Photography Sprint",
        description="Take one intentional photo every day this week. Each day has a theme — no professional camera needed, just your phone.",
        difficulty=1, duration_days=7,
        tasks=[
            (1, "Day 1: Light", "Find and photograph an interesting light source or shadow. Golden hour, a lamp, a window — anything.", "Your photo"),
            (2, "Day 2: Texture", "Get close and photograph a texture you find fascinating — bark, fabric, concrete, food.", "Your photo"),
            (3, "Day 3: Reflection", "Photograph a reflection — in water, glass, a mirror or a puddle.", "Your photo"),
            (4, "Day 4: Motion", "Capture something moving — a person walking, water flowing, a falling object.", "Your photo"),
            (5, "Day 5: Colour", "Build a photo around a single dominant colour.", "Your photo"),
            (6, "Day 6: Portrait", "Photograph a person (or pet) in a candid or posed moment.", "Your photo"),
            (7, "Day 7: Your favourite place", "Photograph the place that means the most to you today.", "Your photo — this is the keeper of the week"),
        ],
    ),

    # ── PRODUCTIVITY ──────────────────────────────────────────────────────
    dict(
        category=Category.PRODUCTIVITY,
        title="14-Day Deep Work Sprint",
        description="Every day, complete one 90-minute block of uninterrupted focused work on your most important task. No notifications, no multitasking.",
        difficulty=3, duration_days=14,
        tasks=gen_tasks([
            ("Day {day}: Plan your block", "Decide tonight what your 90-minute deep work task is for tomorrow. Write it down and clear your desk.", "Photo of your written plan"),
            ("Day {day}: Deep work block", "Complete your 90-minute focused session. Phone off, notifications off, door closed.", "Photo of your workspace before the session starts"),
            ("Day {day}: Single-task only", "Pick your three most important tasks today and do only those — no other work.", "Photo of your three-task list"),
            ("Day {day}: Distraction log", "Every time you feel the urge to check email or social media, note it. Count at the end of the day.", "Photo of your distraction log"),
            ("Day {day}: Energy peak session", "Schedule your deep work at your personal peak energy time (morning for most people).", "Photo of your calendar or planner"),
            ("Day {day}: Weekly review", "Spend 20 minutes reviewing what you accomplished this week and planning next week.", "Photo of your review notes"),
            ("Day {day}: Shutdown ritual", "End work at a fixed time. Write a shutdown note: what's done, what's next, then close everything.", "Photo of your shutdown note"),
        ], 14),
    ),

    # ── SOCIAL ────────────────────────────────────────────────────────────
    dict(
        category=Category.SOCIAL,
        title="14-Day Connection Challenge",
        description="Reach out to one person every day for two weeks. Rebuild old friendships, strengthen new ones, or meet someone new.",
        difficulty=2, duration_days=14,
        tasks=gen_tasks([
            ("Day {day}: Text someone you miss", "Send a genuine message to someone you haven't spoken to in a while. No copy-paste.", "Screenshot of the sent message (blur name if needed)"),
            ("Day {day}: Pay a compliment", "Give a sincere, specific compliment to someone in person or online.", "Brief note about the reaction or how it felt"),
            ("Day {day}: Ask a real question", "Ask someone a meaningful question you actually want the answer to.", "Note about what you learned from their answer"),
            ("Day {day}: Listen fully", "In a conversation today, focus entirely on listening. Don't plan your reply while they speak.", "Brief reflection on what you noticed"),
            ("Day {day}: Share something honest", "Share something real about yourself with someone you trust.", "Brief journal entry about how it felt"),
            ("Day {day}: Plan something together", "Suggest a specific activity with someone — coffee, a walk, a call, anything concrete.", "Screenshot of the plan you made"),
            ("Day {day}: Express gratitude", "Tell someone specifically what you appreciate about them.", "Brief note on their reaction"),
        ], 14),
    ),

    # ── OUTDOORS ──────────────────────────────────────────────────────────
    dict(
        category=Category.OUTDOORS,
        title="30-Day Daily Walk",
        description="Walk outside for at least 20 minutes every single day, rain or shine. Simple, powerful, and endlessly underrated.",
        difficulty=1, duration_days=30,
        tasks=gen_tasks([
            ("Day {day}: 20-min walk", "Walk outside for at least 20 minutes. Leave your headphones behind for the first 5 minutes.", "Photo of a moment from your walk"),
            ("Day {day}: Notice something new", "Walk your usual route and find one thing you have never noticed before.", "Photo of your discovery"),
            ("Day {day}: Walk faster", "Walk your usual distance 10 % faster than normal. Notice how it feels.", "Fitness app screenshot showing time and distance"),
            ("Day {day}: Nature detail", "Find and photograph one tiny natural detail — a flower, an insect, a leaf pattern.", "Your close-up photo"),
            ("Day {day}: New route", "Walk somewhere you have not walked before, even if it is only a different street.", "Photo from your new route"),
            ("Day {day}: Walk with someone", "Invite a friend, family member or neighbour to join you today.", "Photo with your walking companion"),
            ("Day {day}: Mindful walk", "Walk for 20 minutes focusing only on your senses — what you see, hear, smell, feel.", "Brief journal note about what you noticed"),
        ], 30),
    ),
    dict(
        category=Category.OUTDOORS,
        title="7-Day Morning Nature Ritual",
        description="Step outside within 30 minutes of waking, every morning for a week. Light, fresh air, and movement before screens.",
        difficulty=1, duration_days=7,
        tasks=[
            (1, "Day 1: Sunrise moment", "Step outside within 30 minutes of waking. Stand still for 2 minutes and simply observe.", "Selfie outside in the morning light"),
            (2, "Day 2: Barefoot on grass", "Walk barefoot on grass or soil for 5 minutes.", "Photo of your feet on the ground"),
            (3, "Day 3: 10-min walk before coffee", "Go for a 10-minute walk before your first coffee or phone check.", "Photo from your morning walk"),
            (4, "Day 4: Cloud watching", "Lie on the ground outside for 10 minutes looking at the sky.", "Photo of the sky you watched"),
            (5, "Day 5: Collect something", "Bring back one natural object from your morning time outside.", "Photo of your find"),
            (6, "Day 6: Document the sounds", "Spend 5 minutes outside with your eyes closed, listening. Write down every sound you heard.", "Your written sound list"),
            (7, "Day 7: Morning pages outside", "Take your journal outside and write for 10 minutes in the morning air.", "Photo of your journal outside"),
        ],
    ),

    # ── SUSTAINABILITY ────────────────────────────────────────────────────
    dict(
        category=Category.SUSTAINABILITY,
        title="30-Day Zero Waste",
        description="Reduce your daily waste footprint step by step. By day 30 you will have permanent habits that make a real difference.",
        difficulty=3, duration_days=30,
        tasks=gen_tasks([
            ("Day {day}: Waste audit", "Collect all the waste you produce today in one bag. Count and categorise it.", "Photo of your waste bag"),
            ("Day {day}: Refuse single-use plastic", "Go through the day refusing all single-use plastic — bags, straws, packaging.", "Photo showing the reusables you used instead"),
            ("Day {day}: Cook from bulk", "Cook one meal using ingredients bought loose or with minimal packaging.", "Photo of your ingredients without plastic packaging"),
            ("Day {day}: Compost something", "Start or contribute to a compost bin. Any food scraps count.", "Photo of your compost bin or scraps"),
            ("Day {day}: Second-hand find", "Find something you need second-hand instead of buying new.", "Photo of your second-hand find"),
            ("Day {day}: Repair instead of replace", "Fix something broken instead of throwing it away.", "Before/after photo of the repair"),
            ("Day {day}: Offset review", "Research one carbon offsetting action relevant to your life and take it or plan it.", "Screenshot or photo of your offset action"),
        ], 30),
    ),
    dict(
        category=Category.SUSTAINABILITY,
        title="7-Day Plant-Based Week",
        description="Eat entirely plant-based for seven days. No meat, no dairy, no eggs. Discover how satisfying and varied plant food can be.",
        difficulty=2, duration_days=7,
        tasks=[
            (1, "Day 1: Plant-based breakfast", "Make a satisfying plant-based breakfast. Oat milk porridge, avocado toast, or a fruit smoothie.", "Photo of your breakfast"),
            (2, "Day 2: Protein focus", "Make sure every meal today includes a plant protein: lentils, tofu, tempeh, chickpeas, or beans.", "Photo of your protein source"),
            (3, "Day 3: Cook something new", "Make a plant-based dish you have never tried before.", "Photo of the dish"),
            (4, "Day 4: Eat out plant-based", "Find a plant-based option at a restaurant or café.", "Photo of your meal"),
            (5, "Day 5: Dairy alternatives", "Try a plant-based alternative to a dairy product you normally use.", "Photo of the alternative"),
            (6, "Day 6: Meal prep", "Prep plant-based meals or ingredients for the next two days.", "Photo of your prepped food"),
            (7, "Day 7: Full plant-based day", "Complete a full plant-based day — breakfast, lunch, dinner and snacks.", "Photo collage or single photo of your day's meals"),
        ],
    ),

    # ── FINANCE ───────────────────────────────────────────────────────────
    dict(
        category=Category.FINANCE,
        title="30-Day Savings Challenge",
        description="Save a small amount every day for 30 days. It is not about the total — it is about proving to yourself that saving is a habit, not an event.",
        difficulty=2, duration_days=30,
        tasks=gen_tasks([
            ("Day {day}: Transfer to savings", "Move at least €1 (or your currency equivalent) to a savings account or jar today.", "Screenshot of the transfer or photo of your savings jar"),
            ("Day {day}: Track your spending", "Write down every purchase you made today, including small ones.", "Photo of your spending list"),
            ("Day {day}: Find a saving", "Find one thing you would normally buy today and choose not to. Note the amount saved.", "Brief note on what you skipped and how much you saved"),
            ("Day {day}: Review subscriptions", "Open your bank statement and find subscriptions you have forgotten about. Cancel one.", "Screenshot showing the cancelled subscription"),
            ("Day {day}: Cook instead of order", "Cook a meal at home instead of ordering delivery. Note the cost difference.", "Photo of your home-cooked meal"),
            ("Day {day}: 24-hour rule", "If you want to buy something non-essential today, wait 24 hours before deciding.", "Brief note on what you wanted and your decision"),
            ("Day {day}: Weekly total", "Add up everything you saved or didn't spend this week. Write your total.", "Photo of your weekly savings note"),
        ], 30),
    ),
    dict(
        category=Category.FINANCE,
        title="14-Day Budget Reboot",
        description="Two weeks of intentional spending. Track every euro, categorise it, and find where your money actually goes versus where you think it goes.",
        difficulty=2, duration_days=14,
        tasks=gen_tasks([
            ("Day {day}: Log all spending", "Write down every purchase today — no matter how small. Use an app or paper.", "Photo of your spending log"),
            ("Day {day}: Categorise yesterday", "Take yesterday's spending log and put each item into a category.", "Photo of your categorised list"),
            ("Day {day}: Set a daily limit", "Pick a daily spending limit for non-essentials and stick to it today.", "Photo of your limit written down"),
            ("Day {day}: Find a free alternative", "Find a free version of something you normally pay for.", "Brief note on what you found"),
            ("Day {day}: Meal plan to save", "Plan every meal for the next three days to avoid impulse food spending.", "Photo of your meal plan"),
            ("Day {day}: Negotiation day", "Call or message one service provider (phone, internet, insurance) and ask for a better rate.", "Screenshot or note about the outcome"),
            ("Day {day}: Weekly spend review", "Total last week's spending by category. Compare to your expectations.", "Photo of your category totals"),
        ], 14),
    ),

    # ── DIGITAL DETOX ─────────────────────────────────────────────────────
    dict(
        category=Category.DIGITAL_DETOX,
        title="30-Day Screen-Free Morning",
        description="No phone, no laptop, no TV for the first 60 minutes after you wake up. Build 30 days of mornings that are yours.",
        difficulty=2, duration_days=30,
        tasks=gen_tasks([
            ("Day {day}: Phone-free first hour", "Do not look at your phone for the first 60 minutes after waking. Note what you do instead.", "Brief note on how you spent the first hour"),
            ("Day {day}: Alarm clock only", "Use a physical alarm clock or a basic function so your phone stays out of the bedroom.", "Photo of your alarm clock or phone charging outside the bedroom"),
            ("Day {day}: Morning routine instead", "Replace the morning scroll with a consistent routine: water, stretch, journal, or walk.", "Photo of your morning routine setup"),
            ("Day {day}: No notifications before noon", "Turn off all non-essential notifications until midday.", "Screenshot of your notification settings"),
            ("Day {day}: Read instead of scroll", "Replace 30 minutes of screen time with reading a physical book.", "Photo of your book"),
            ("Day {day}: Grayscale mode", "Switch your phone to grayscale for the whole day and notice how it changes your urge to scroll.", "Screenshot of your phone in grayscale mode"),
            ("Day {day}: Weekly reflection", "Write three sentences on how your mornings feel different after a week of this.", "Photo of your reflection"),
        ], 30),
    ),
    dict(
        category=Category.DIGITAL_DETOX,
        title="7-Day Social Media Detox",
        description="Delete all social media apps from your phone for seven days. See what fills the gaps — it might surprise you.",
        difficulty=3, duration_days=7,
        tasks=[
            (1, "Day 1: Delete the apps", "Delete Instagram, TikTok, Twitter/X, Facebook and any other social apps from your phone.", "Screenshot of your home screen without the apps"),
            (2, "Day 2: Notice the urges", "Every time you reach for a social app, write it down. Count at the end of the day.", "Photo of your urge tally"),
            (3, "Day 3: Replace with something analog", "Fill your biggest social-media time slot with something completely offline.", "Photo of your offline activity"),
            (4, "Day 4: Reconnect directly", "Contact two people you would normally passively follow by calling or texting them.", "Screenshot of one of the conversations"),
            (5, "Day 5: Boredom sit", "The next time you feel bored, do not reach for your phone. Sit with the boredom for 5 minutes.", "Brief journal entry on what came up"),
            (6, "Day 6: Log your free time", "Track what you did with the time you normally spend on social media.", "Photo of your time log"),
            (7, "Day 7: Reflect before returning", "Write about what you discovered this week before deciding what (if anything) to reinstall.", "Photo of your written reflection"),
        ],
    ),
]


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

TEST_USERS = [
    dict(
        firebase_uid="dev-user",
        username="alex",
        display_name="Alex",
        bio="Building good habits, one day at a time.",
        study_group=StudyGroup.TREATMENT,
        price_variant=PriceVariant.A,
    ),
    dict(
        firebase_uid="dev-alice",
        username="alice",
        display_name="Alice",
        bio="Runner, reader, curious person.",
        study_group=StudyGroup.CONTROL,
        price_variant=PriceVariant.B,
    ),
    dict(
        firebase_uid="dev-bob",
        username="bob",
        display_name="Bob",
        bio="Trying to eat better and sleep more.",
        study_group=StudyGroup.TREATMENT,
        price_variant=PriceVariant.A,
    ),
]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def seed():
    with Session(engine) as db:
        # Users
        users: list[User] = []
        for u in TEST_USERS:
            existing = db.scalar(select(User).where(User.firebase_uid == u["firebase_uid"]))
            if existing:
                print(f"  user @{u['username']} already exists, skipping")
                users.append(existing)
            else:
                user = User(**u, timezone="Europe/Bucharest")
                db.add(user)
                db.flush()
                users.append(user)
                print(f"  created user @{u['username']}")

        creator = users[0]

        # Challenges
        created = 0
        skipped = 0
        for defn in CHALLENGES:
            existing = db.scalar(
                select(Challenge).where(Challenge.title == defn["title"])
            )
            if existing:
                skipped += 1
                continue

            diff = defn["difficulty"]
            dur = defn["duration_days"]
            challenge = Challenge(
                title=defn["title"],
                description=defn["description"],
                category=defn["category"],
                difficulty=diff,
                duration_days=dur,
                completion_xp=completion_xp(diff, dur),
                source=ChallengeSource.TEMPLATE,
                visibility=Visibility.PUBLIC,
                creator_id=creator.id,
                tasks=[
                    ChallengeTask(
                        day_number=day,
                        title=title,
                        instructions=instructions,
                        proof_hint=proof_hint,
                        xp=task_xp(diff),
                    )
                    for day, title, instructions, proof_hint in defn["tasks"]
                ],
            )
            db.add(challenge)
            created += 1

        db.commit()
        print(f"\nDone. {created} challenges created, {skipped} already existed.")
        print(f"Users: {len(users)} total\n")

        # Summary by category
        from sqlalchemy import func
        rows = db.execute(
            select(Challenge.category, func.count())
            .group_by(Challenge.category)
            .order_by(Challenge.category)
        ).all()
        for cat, cnt in rows:
            print(f"  {cat:<20} {cnt} challenge(s)")


if __name__ == "__main__":
    print("Seeding database...")
    seed()
