"""Hand-written challenge templates: the non-AI baseline for challenge generation.

Control users get these instead of model drafts, so ratings and edit rates can be compared, and
treatment users get them when the model fails. Each category has a rotation of daily tasks;
`{n}` in a task is replaced by its amount for the chosen difficulty (1-5).
"""

import random
from dataclasses import dataclass

from app.enums import Category
from app.schemas.challenges import ChallengeDraft, TaskIn


@dataclass(frozen=True)
class TemplateTask:
    title: str
    instructions: str
    proof_hint: str
    amounts: tuple[int, int, int, int, int] | None = None


@dataclass(frozen=True)
class Template:
    name: str
    description: str
    tasks: tuple[TemplateTask, ...]


T = TemplateTask

TEMPLATES: dict[Category, Template] = {
    Category.FITNESS: Template(
        "Fitness",
        "Move your body every day and build a habit that sticks.",
        (
            T(
                "Push-ups",
                "Do {n} push-ups, in as many sets as you need.",
                "You mid-push-up",
                (10, 20, 35, 50, 80),
            ),
            T(
                "Squats",
                "Do {n} bodyweight squats.",
                "You at the bottom of a squat",
                (15, 30, 50, 75, 120),
            ),
            T(
                "Plank",
                "Hold a plank for {n} seconds in total.",
                "You holding a plank",
                (30, 60, 120, 180, 300),
            ),
            T(
                "Walk or run",
                "Walk or run {n} km.",
                "Your fitness app or watch showing the distance",
                (1, 2, 4, 6, 10),
            ),
            T(
                "Stretch",
                "Do a {n}-minute full-body stretch.",
                "You in a stretch",
                (5, 10, 15, 20, 30),
            ),
        ),
    ),
    Category.NUTRITION: Template(
        "Healthy eating",
        "Small, steady changes to what you eat and drink.",
        (
            T(
                "Water",
                "Drink {n} glasses of water today.",
                "Your water bottle or glass",
                (4, 6, 8, 10, 12),
            ),
            T(
                "Vegetables",
                "Eat {n} servings of vegetables today.",
                "A plate with your vegetables",
                (1, 2, 3, 4, 5),
            ),
            T(
                "Home-cooked meal",
                "Cook one meal from scratch instead of ordering in.",
                "The meal you cooked",
            ),
            T(
                "No sugary drinks",
                "Skip soda and sweet drinks for the whole day.",
                "Your drink of choice today (no soda)",
            ),
            T("Fruit snack", "Swap a snack for a piece of fruit.", "The fruit you ate"),
        ),
    ),
    Category.MINDFULNESS: Template(
        "Mindfulness",
        "A few calm minutes a day to clear your head.",
        (
            T("Meditate", "Meditate for {n} minutes.", "Your meditation timer", (2, 5, 10, 15, 25)),
            T(
                "Gratitude",
                "Write down {n} things you are grateful for.",
                "Your gratitude list",
                (1, 3, 5, 7, 10),
            ),
            T(
                "Breathing",
                "Do {n} rounds of slow box breathing (4 s in, hold, out, hold).",
                "A calm spot where you did it",
                (3, 5, 10, 15, 20),
            ),
            T(
                "Mindful walk",
                "Take a {n}-minute walk without your phone in your hand.",
                "Something you noticed on your walk",
                (5, 10, 15, 20, 30),
            ),
            T(
                "Journal",
                "Journal for {n} minutes about your day.",
                "Your journal page",
                (3, 5, 10, 15, 20),
            ),
        ),
    ),
    Category.SLEEP: Template(
        "Better sleep",
        "Build an evening routine that gets you better rest.",
        (
            T(
                "Screens off",
                "Put screens away {n} minutes before bed.",
                "Your phone charging away from your bed",
                (10, 20, 30, 45, 60),
            ),
            T(
                "Same bedtime",
                "Go to bed at the time you planned.",
                "Your alarm clock or bedtime reminder",
            ),
            T(
                "Morning light",
                "Get {n} minutes of daylight within an hour of waking.",
                "The view outside in the morning",
                (2, 5, 10, 15, 20),
            ),
            T(
                "Wind down",
                "Read or stretch for {n} minutes before sleep instead of scrolling.",
                "Your book or mat by the bed",
                (5, 10, 15, 20, 30),
            ),
            T("Tidy bedroom", "Tidy your bedroom so it's calm at night.", "Your tidy bedroom"),
        ),
    ),
    Category.LEARNING: Template(
        "Learning",
        "Learn something new a little every day.",
        (
            T(
                "Study session",
                "Study a topic you care about for {n} minutes.",
                "Your notes or course page",
                (10, 20, 30, 45, 60),
            ),
            T(
                "New words",
                "Learn {n} new words in a language you're learning.",
                "Your flashcards or word list",
                (3, 5, 10, 15, 25),
            ),
            T(
                "Explainer",
                "Watch an educational video and write {n} key takeaways.",
                "Your takeaways",
                (1, 2, 3, 4, 5),
            ),
            T(
                "Practice",
                "Practice a skill for {n} minutes.",
                "You practising",
                (10, 20, 30, 45, 60),
            ),
            T(
                "Teach it back",
                "Explain something you learned this week in {n} sentences.",
                "Your written explanation",
                (2, 3, 5, 7, 10),
            ),
        ),
    ),
    Category.READING: Template(
        "Reading",
        "Make reading part of every day.",
        (
            T("Read", "Read {n} pages of a book.", "The page you stopped on", (5, 10, 20, 35, 50)),
            T(
                "Quote",
                "Read {n} pages and copy your favourite sentence.",
                "The sentence you copied",
                (5, 10, 20, 35, 50),
            ),
            T("Long read", "Read a long article or a book chapter.", "The article or chapter"),
            T(
                "Reading spot",
                "Read for {n} minutes somewhere new.",
                "Your reading spot with the book",
                (10, 15, 25, 40, 60),
            ),
            T("Summary", "Write a short summary of what you read so far.", "Your summary"),
        ),
    ),
    Category.CREATIVITY: Template(
        "Creativity",
        "Make something every day, however small.",
        (
            T(
                "Sketch",
                "Draw something you can see right now for {n} minutes.",
                "Your sketch",
                (5, 10, 15, 25, 40),
            ),
            T(
                "Write",
                "Write {n} words of a story or poem.",
                "Your text",
                (50, 100, 250, 500, 1000),
            ),
            T(
                "Photo walk",
                "Take {n} photos around a single theme.",
                "Your favourite of the photos",
                (3, 5, 8, 12, 20),
            ),
            T(
                "Make music",
                "Play or compose music for {n} minutes.",
                "Your instrument or music app",
                (5, 10, 20, 30, 45),
            ),
            T(
                "Craft",
                "Build or craft something small with what you have at home.",
                "What you made",
            ),
        ),
    ),
    Category.PRODUCTIVITY: Template(
        "Productivity",
        "Get the important things done, one day at a time.",
        (
            T(
                "Top three",
                "Write your 3 most important tasks and finish them.",
                "Your list, ticked off",
            ),
            T(
                "Focus block",
                "Work for {n} minutes with no notifications.",
                "Your timer at the end of the block",
                (15, 25, 45, 60, 90),
            ),
            T(
                "Inbox",
                "Clear {n} emails or messages you've been putting off.",
                "Your inbox count afterwards",
                (5, 10, 20, 30, 50),
            ),
            T("Declutter", "Tidy your desk or workspace.", "Your tidy desk"),
            T("Plan tomorrow", "Plan tomorrow before you finish today.", "Your plan for tomorrow"),
        ),
    ),
    Category.SOCIAL: Template(
        "Connection",
        "Strengthen your relationships with small daily actions.",
        (
            T(
                "Reach out",
                "Message {n} people you haven't talked to in a while.",
                "Your sent message (hide names if you like)",
                (1, 2, 3, 4, 5),
            ),
            T(
                "Call",
                "Call a friend or family member for at least {n} minutes.",
                "Your call log",
                (5, 10, 15, 20, 30),
            ),
            T(
                "Compliment",
                "Give {n} genuine compliments today.",
                "A note of who you complimented (no names needed)",
                (1, 2, 3, 4, 5),
            ),
            T("Meet up", "Spend time with someone in person.", "The place you met"),
            T("Thank-you note", "Write a thank-you note to someone.", "Your note"),
        ),
    ),
    Category.OUTDOORS: Template(
        "Outdoors",
        "Get outside every day.",
        (
            T(
                "Outside time",
                "Spend {n} minutes outdoors.",
                "Where you spent it",
                (10, 20, 30, 60, 90),
            ),
            T("New place", "Visit a park or street you haven't been to.", "The new place"),
            T(
                "Nature spotting",
                "Find and photograph {n} different plants or birds.",
                "One of them",
                (1, 3, 5, 8, 12),
            ),
            T("Sunrise or sunset", "Watch a sunrise or a sunset.", "The sky"),
            T(
                "Hike",
                "Walk {n} km on a trail or through a park.",
                "The trail or your distance",
                (1, 3, 5, 8, 12),
            ),
        ),
    ),
    Category.SUSTAINABILITY: Template(
        "Sustainability",
        "Small habits that are better for the planet.",
        (
            T("Reusable", "Use a reusable bottle, cup or bag all day.", "Your reusable item"),
            T(
                "No car",
                "Walk, cycle or take public transport instead of driving.",
                "Your bike, ticket or route",
            ),
            T(
                "Pick up litter",
                "Pick up {n} pieces of litter.",
                "The litter you collected",
                (3, 5, 10, 20, 30),
            ),
            T(
                "Plant-based meal",
                "Eat {n} plant-based meals today.",
                "Your plant-based meal",
                (1, 1, 2, 2, 3),
            ),
            T("Sort waste", "Sort today's waste for recycling.", "Your sorted bins"),
        ),
    ),
    Category.FINANCE: Template(
        "Money",
        "Take control of your money a little each day.",
        (
            T(
                "Track spending",
                "Write down everything you spent today.",
                "Your spending list (amounts only)",
            ),
            T(
                "No-spend",
                "Spend nothing on non-essentials today.",
                "Your empty shopping cart or wallet",
            ),
            T(
                "Save",
                "Move {n}% of today's budget into savings.",
                "Your savings app (hide balances if you like)",
                (1, 2, 5, 10, 15),
            ),
            T(
                "Subscriptions",
                "Review your subscriptions and cancel one you don't use.",
                "Your subscriptions list",
            ),
            T(
                "Learn",
                "Read about one personal-finance topic for {n} minutes.",
                "What you read",
                (5, 10, 15, 20, 30),
            ),
        ),
    ),
    Category.DIGITAL_DETOX: Template(
        "Digital detox",
        "Spend less time on your phone and more on your life.",
        (
            T(
                "Screen time",
                "Keep social media under {n} minutes today.",
                "Your screen-time report",
                (120, 90, 60, 30, 15),
            ),
            T(
                "Phone-free meal",
                "Eat a meal with your phone out of reach.",
                "Your meal, phone nowhere in sight",
            ),
            T(
                "Offline hour",
                "Spend {n} minutes with your phone switched off.",
                "Your switched-off phone",
                (15, 30, 60, 90, 120),
            ),
            T(
                "Notifications",
                "Turn off notifications for {n} apps.",
                "Your notification settings",
                (1, 3, 5, 8, 10),
            ),
            T(
                "Analog evening",
                "Do something offline you enjoy instead of scrolling tonight.",
                "What you did",
            ),
        ),
    ),
}


def _task(template: TemplateTask, day: int, difficulty: int) -> TaskIn:
    amount = str(template.amounts[difficulty - 1]) if template.amounts else ""
    return TaskIn(
        day_number=day,
        title=template.title,
        instructions=template.instructions.replace("{n}", amount),
        proof_hint=template.proof_hint,
    )


def draft(
    category: Category | None,
    difficulty: int,
    duration_days: int,
    goal: str | None = None,
    rng: random.Random | None = None,
) -> ChallengeDraft:
    rng = rng or random.Random()
    category = category or rng.choice(list(Category))
    template = TEMPLATES[category]
    start = rng.randrange(len(template.tasks))
    tasks = [
        _task(template.tasks[(start + day) % len(template.tasks)], day + 1, difficulty)
        for day in range(duration_days)
    ]
    title = (
        f"{template.name} day"
        if duration_days == 1
        else f"{duration_days}-day {template.name.lower()} challenge"
    )
    description = template.description
    if goal:
        description = f"{description} Your goal: {goal}"
    return ChallengeDraft(
        title=title[0].upper() + title[1:],
        description=description[:2000],
        category=category,
        difficulty=difficulty,
        duration_days=duration_days,
        tasks=tasks,
    )
