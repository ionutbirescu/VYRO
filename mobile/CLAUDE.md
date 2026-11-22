# VYRO Mobile — Design System

## Stack
- Expo Router (file-based routing in `src/app/`)
- React Native + TypeScript, no NativeWind
- Styling: `StyleSheet.create` exclusively — never inline styles for layout
- Animations: `react-native-reanimated` (spring press effects on interactive cards)
- Font: **Inter** via `@expo-google-fonts/inter` — always use `InterFonts.*` constants

## Color palette — GTA6 / Miami Vice theme

Import from `@/constants/theme`:

```ts
BrandColors.headerBg   // '#0D0A1E' — deep night sky, used as all screen headers
BrandColors.pink       // '#FF2D78' — primary accent (buttons, links, focus rings)
BrandColors.cyan       // '#00D9C8' — secondary accent
BrandColors.orange     // '#FF6B00' — energy/streak
BrandColors.purple     // '#BF5FFF' — extreme difficulty, special states
BrandColors.green      // '#00C57E' — success, easy difficulty

AccentColor            // = BrandColors.pink
StreakColor            // = BrandColors.orange
SuccessColor           // = BrandColors.green
```

Theme-aware colors (use `useTheme()` hook):
```ts
colors.text               // primary text
colors.textSecondary      // muted text
colors.background         // screen background
colors.backgroundElement  // card/input surface
colors.backgroundSelected // selected state / dividers
```

## Screen layout pattern — REQUIRED for all tab screens

Every tab screen and modal MUST use this pattern:
```tsx
const HEADER_BG = BrandColors.headerBg; // '#0D0A1E'

<View style={{ flex: 1, backgroundColor: HEADER_BG }}>
  {/* Decorative glows — always add both */}
  <View style={[{ position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,45,120,0.14)' },
    { width: 240, height: 240, top: -80, right: -60 }]} pointerEvents="none" />
  <View style={[{ position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(0,217,200,0.10)' },
    { width: 120, height: 120, top: 20, right: 50 }]} pointerEvents="none" />

  <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: HEADER_BG }}>
    {/* White title, rgba(255,255,255,0.65) subtitle */}
  </SafeAreaView>

  {/* White/lavender sheet */}
  <View style={{ flex: 1, backgroundColor: '#F7F0FF', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
    <ScrollView ...>
      {/* content */}
    </ScrollView>
  </View>
</View>
```

Stack screens (pushed modals) inherit the dark header from `_layout.tsx` — no need to add your own header.

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
