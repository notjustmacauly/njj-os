import * as L from "lucide-react";

// One icon family for the storefront (Lucide, already a project dependency),
// always at a light 1.5 stroke. Import icons from here, not lucide directly.
type P = { className?: string };
const w = (Icon: L.LucideIcon) =>
  function StoreIcon({ className }: P) {
    return <Icon className={className} strokeWidth={1.5} aria-hidden />;
  };

export const CalendarBlank = w(L.CalendarDays);
export const ClockLine = w(L.Clock);
export const MapPinLine = w(L.MapPin);
export const ArrowLeftLine = w(L.ArrowLeft);
export const ArrowUpRightLine = w(L.ArrowUpRight);
export const CheckLine = w(L.Check);
export const CheckCircleLine = w(L.CheckCircle2);
export const MinusLine = w(L.Minus);
export const PlusLine = w(L.Plus);
export const TrashLine = w(L.Trash2);
export const ImageUpLine = w(L.ImageUp);
export const SpinnerLine = w(L.Loader2);
export const TruckLine = w(L.Truck);
export const SnowflakeLine = w(L.Snowflake);
export const LeafLine = w(L.Leaf);
export const ShoppingBagLine = w(L.ShoppingBag);
export const UserLine = w(L.UserRound);
export const MailLine = w(L.Mail);
export const TicketLine = w(L.Ticket);
export const PackageLine = w(L.Package);
export const WalletLine = w(L.WalletCards);
export const UsersLine = w(L.UsersRound);
export const CrownLine = w(L.Crown);
export const MedalLine = w(L.Medal);
export const FlameLine = w(L.Flame);
export const ShieldCheckLine = w(L.ShieldCheck);
export const CalendarCheckLine = w(L.CalendarCheck);
export const DumbbellLine = w(L.Dumbbell);
export const SparklesLine = w(L.Sparkles);
export const TrendingUpLine = w(L.TrendingUp);
export const AwardLine = w(L.Award);
export const HourglassLine = w(L.Hourglass);
export const TrophyLine = w(L.Trophy);
