/**
 * Every icon this app uses, and the only place Phosphor is named.
 *
 * Two reasons this file exists rather than importing from the package root.
 *
 * The first is weight, and it is not marginal. Phosphor's barrel re-exports
 * roughly fifteen hundred icon modules, and Metro does not tree-shake them
 * away — importing four icons from it took this app's bundle from 1,393
 * modules to 4,619. For an app sold on "we do not waste your data", shipping
 * a thousand unused glyphs to a phone in Buea is not a detail.
 *
 * The second is discipline. One visual family per surface is the rule, and a
 * single import list is what keeps it true: adding an icon means adding a line
 * here, where the whole set is visible at once and an inconsistency is obvious.
 *
 * The subpath is the package's own published export — `./src/icons/*` is in
 * its exports map, not a guess at its internals — and routing it through one
 * file means a future restructure breaks here rather than in nine screens.
 *
 * Sizes, used consistently: 16 inline beside secondary text, 22 for a row
 * leader or a control, 28 for the one feature anchor on a screen.
 */

export { ArrowRightIcon } from "phosphor-react-native/src/icons/ArrowRight";
export { CarIcon } from "phosphor-react-native/src/icons/Car";
export { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
export { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
export { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
export { CheckIcon } from "phosphor-react-native/src/icons/Check";
export { CircleIcon } from "phosphor-react-native/src/icons/Circle";
export { ClockIcon } from "phosphor-react-native/src/icons/Clock";
export { CrosshairIcon } from "phosphor-react-native/src/icons/Crosshair";
export { DeviceMobileIcon } from "phosphor-react-native/src/icons/DeviceMobile";
export { HouseIcon } from "phosphor-react-native/src/icons/House";
export { InfoIcon } from "phosphor-react-native/src/icons/Info";
export { ListIcon } from "phosphor-react-native/src/icons/List";
export { LockIcon } from "phosphor-react-native/src/icons/Lock";
export { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";
export { MapPinIcon } from "phosphor-react-native/src/icons/MapPin";
export { MoneyIcon } from "phosphor-react-native/src/icons/Money";
export { MountainsIcon } from "phosphor-react-native/src/icons/Mountains";
export { PhoneCallIcon } from "phosphor-react-native/src/icons/PhoneCall";
export { PhoneIcon } from "phosphor-react-native/src/icons/Phone";
export { SealCheckIcon } from "phosphor-react-native/src/icons/SealCheck";
export { ShareNetworkIcon } from "phosphor-react-native/src/icons/ShareNetwork";
export { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";
export { SignOutIcon } from "phosphor-react-native/src/icons/SignOut";
export { StarIcon } from "phosphor-react-native/src/icons/Star";
export { UserCircleIcon } from "phosphor-react-native/src/icons/UserCircle";
export { WalletIcon } from "phosphor-react-native/src/icons/Wallet";
export { WarningIcon } from "phosphor-react-native/src/icons/Warning";
