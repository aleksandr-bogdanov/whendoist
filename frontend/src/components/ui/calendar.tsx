import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD = 50;
const SLIDE_PX = 80;
const TRANSITION = { duration: 0.2, ease: "easeInOut" } as const;

function Calendar({ className, defaultMonth, ...props }: DayPickerProps) {
  const [month, setMonth] = useState(defaultMonth ?? new Date());
  const [direction, setDirection] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  const navigate = useCallback((delta: number) => {
    setDirection(delta);
    setMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  }, []);

  const handleMonthChange = useCallback(
    (newMonth: Date) => {
      const delta = newMonth.getTime() > month.getTime() ? 1 : -1;
      setDirection(delta);
      setMonth(newMonth);
    },
    [month],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;
      navigate(dx < 0 ? 1 : -1);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [navigate]);

  const monthKey = `${month.getFullYear()}-${month.getMonth()}`;

  return (
    <div ref={containerRef} className="overflow-hidden">
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={monthKey}
          custom={direction}
          variants={{
            enter: (dir: number) => ({ x: dir * SLIDE_PX, opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit: (dir: number) => ({ x: dir * -SLIDE_PX, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={TRANSITION}
        >
          <DayPicker
            month={month}
            onMonthChange={handleMonthChange}
            fixedWeeks
            className={cn("p-2", className)}
            classNames={{
              months: "relative flex flex-col",
              month_caption: "relative flex justify-center items-center h-10 mb-1",
              caption_label: "text-base font-semibold",
              nav: "absolute inset-x-0 top-0 flex items-center justify-between h-10 px-1 z-10 pointer-events-none",
              button_previous: cn(
                "inline-flex items-center justify-center h-10 w-10 rounded-lg pointer-events-auto",
                "bg-secondary hover:bg-accent text-foreground active:scale-95",
              ),
              button_next: cn(
                "inline-flex items-center justify-center h-10 w-10 rounded-lg pointer-events-auto",
                "bg-secondary hover:bg-accent text-foreground active:scale-95",
              ),
              month_grid: "w-full border-collapse",
              weekdays: "",
              weekday: "text-muted-foreground text-xs font-medium h-9 text-center",
              week: "",
              day: "text-center p-0.5",
              day_button: cn(
                "h-11 w-11 rounded-lg text-[15px] font-normal transition-colors",
                "hover:bg-accent active:scale-95 cursor-pointer",
                "inline-flex items-center justify-center",
              ),
              selected: "!bg-primary !text-primary-foreground !font-semibold",
              today: "font-bold text-primary ring-2 ring-primary/30 rounded-lg",
              disabled: "text-muted-foreground/40 !cursor-default pointer-events-none",
              outside: "text-muted-foreground/40",
              hidden: "invisible",
            }}
            components={{
              Chevron: ({ orientation }) =>
                orientation === "left" ? (
                  <ChevronLeft className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                ),
            }}
            {...props}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export { Calendar };
