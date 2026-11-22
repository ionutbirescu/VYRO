# VYRO Mobile — Design System

## Stack
- Expo Router (file-based routing in `src/app/`)
- React Native + TypeScript, no NativeWind
- Styling: `StyleSheet.create` exclusively — never inline styles for layout
- Animations: `react-native-reanimated` (spring press effects on interactive cards)
- Font: **SpaceGrotesk** via `@expo-google-fonts/space-grotesk` — always use `InterFonts.*` constants (alias kept for compatibility)

## Anti-AI-Slop Rules (tab screens)
- **No emojis in UI chrome** (headers, stats, buttons, chips). Use Ionicons when an icon is really needed.
- **No gradients** on cards or buttons. Primary buttons are solid `UI.accent`.
- **One accent per screen.** Everything else is `UI.text` / `UI.muted` / `UI.faint` on `UI.surface`.
- **Lists are rows with hairline dividers**, not floating shadowed cards. Cards only for horizontal carousels and summary blocks.
- **No fake data or dead controls.** Don't ship hardcoded achievements, promos, or buttons that don't call the API.
- **Sentence case labels.** No uppercase + letter-spacing section labels.
- **Always set `fontFamily: InterFonts.*`** on every Text style (the values are SpaceGrotesk). `fontWeight` alone falls back to the system font.
- On web, `Alert.alert` with buttons does nothing; use `window.confirm`/`window.alert` when `Platform.OS === 'web'`.

## Colors

Tab screens use the `UI` palette from `@/constants/theme`:
```ts
UI.bg, UI.surface, UI.surfaceHi, UI.line, UI.text, UI.muted, UI.faint, UI.accent, UI.success
CategoryDot[category]  // small colored dot next to a category name
```
`BrandColors`, `GradientPrimary` and `useTheme()` still exist for older stack screens.

## Screen layout pattern for tab screens

Use the shared wrapper from `@/components/screen`. It handles safe area, max width on web and tab bar padding:
```tsx
<Screen>
  <ScreenHeader title="Explore" subtitle="optional" />
  <SectionHeader title="In progress" />
  {/* content */}
</Screen>
```
No decorative glows, no dark header + light sheet.

Stack screens (pushed modals) inherit the dark header from `_layout.tsx`.

## Components

### Button — `@/components/ui/button`
```tsx
<Button label="Join challenge" onPress={fn} />
<Button label="Cancel" variant="outline" onPress={fn} />
<Button label="Delete" variant="danger" size="sm" onPress={fn} />
<Button label="Saving…" loading={true} />
```
Variants: `primary` (pink), `secondary` (cyan), `outline`, `ghost`, `danger`.
Sizes: `sm`, `md` (default), `lg`.
Always use `<Button>` instead of raw `<Pressable>` for primary actions.

### Input — `@/components/ui/input`
```tsx
<Input label="Email" leftIcon="mail-outline" value={email} onChangeText={setEmail} />
<Input label="Password" leftIcon="lock-closed-outline" isPassword value={pw} onChangeText={setPw} />
<Input label="Username" error={errors.username} value={u} onChangeText={setU} />
```
Never use `react-native-paper` TextInput. Always use this component.

### ThemedText — `@/components/themed-text`
Types: `default`, `small`, `smallBold`, `title`, `subtitle`, `link`, `linkPrimary`, `code`.
Use `themeColor="textSecondary"` for muted text.

### ChallengeCard — `@/components/challenge-card`
Variants: `compact` (160×172 horizontal scroll) and `full` (vertical list).
Always use this for challenge display — never invent a new card shape.

## Spacing constants
```ts
Spacing.one   = 4
Spacing.two   = 8
Spacing.three = 16
Spacing.four  = 24
Spacing.five  = 32
Spacing.six   = 64
```

## Difficulty colors
```ts
DifficultyColors[1] // Easy — green
DifficultyColors[2] // Medium — cyan
DifficultyColors[3] // Hard — orange
DifficultyColors[4] // Very Hard — pink
DifficultyColors[5] // Extreme — purple
```

## Rules
- **Never** use `react-native-paper` components. It was removed.
- **Never** hardcode hex colors — use `BrandColors.*`, `AccentColor`, `StreakColor`, or `useTheme()`.
- **Never** use `colors.text` as a background color.
- **Always** add spring press animations (`react-native-reanimated`) on tappable cards.
- **Always** use Inter via `InterFonts.*` for custom font weights.
- For error feedback in forms: render an inline error View, not an alert or snackbar.
- Sheet background is always `#F7F0FF` (light lavender), not plain white or grey.
- Dark mode sheet background is `colors.background` (`#0D0A1E`).
