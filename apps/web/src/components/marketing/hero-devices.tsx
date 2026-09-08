import { Wifi } from "lucide-react";
import { Iphone16ProFrame, MACBOOK_MENU_BAR_HEIGHT, MacbookProFrame } from "./device-frames";
import { DASHBOARD_SCREEN, MEMBER_SCREEN, MemberEntryScreen, OwnerDashboardScreen } from "./product-screens";
import { ScaledScreen } from "./scaled-screen";

/**
 * The hero's product shot: the owner dashboard on a MacBook Pro with the
 * member's Entry QR open on an iPhone in front of it. The chrome is the
 * supplied device artwork; the screens are the product's own surfaces,
 * rendered at their real size and scaled into the frames, so what the frames
 * show is what the dashboard and the member app look like.
 */
export function HeroDevices() {
  return (
    <>
      <div className="relative mx-auto w-full max-w-[660px] pb-14 sm:pb-16" aria-hidden>
        {/* ------------------------------------------------------------ laptop */}
        <div className="w-full animate-rise-in">
          <div className="animate-drift">
            <MacbookProFrame>
              <div className="absolute inset-0 flex flex-col text-ink">
                {/* macOS menu bar — the notch lives here, as on the real machine */}
                <div
                  className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-2 text-[5px] text-ink-3"
                  style={{ height: MACBOOK_MENU_BAR_HEIGHT }}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="size-[5px] rounded-full bg-ink" />
                    <span className="font-semibold text-ink">RIVET</span>
                    <span className="hidden sm:inline">Dashboard</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Wifi className="size-[5px]" strokeWidth={2.4} />
                    <span className="h-[4px] w-[8px] rounded-[1px] border border-ink-3" />
                    <span>9:41</span>
                  </span>
                </div>
                <div className="relative min-h-0 flex-1">
                  <ScaledScreen width={DASHBOARD_SCREEN.width} height={DASHBOARD_SCREEN.height} defaultScale={0.353}>
                    <OwnerDashboardScreen />
                  </ScaledScreen>
                </div>
              </div>
            </MacbookProFrame>
          </div>
        </div>

        {/* ------------------------------------------------------------- phone */}
        {/* Fixed widths with the artwork's locked aspect ratio: the phone stays
            a phone at every breakpoint instead of stretching with the column. */}
        <div className="absolute bottom-0 end-0 w-[128px] animate-rise-in [animation-delay:220ms] sm:w-[164px] xl:w-[180px]">
          <div className="animate-float">
            <Iphone16ProFrame>
              <div className="absolute inset-0 flex flex-col bg-paper text-ink">
                {/* status bar — the Dynamic Island is part of the frame above */}
                <div className="flex h-[7%] shrink-0 items-center justify-between px-3">
                  <span className="text-[5.5px] font-semibold">9:41</span>
                  <span className="flex items-center gap-[2px]">
                    <span className="h-[3px] w-[3px] rounded-full bg-ink-3" />
                    <span className="h-[4px] w-[3px] rounded-[1px] bg-ink-3" />
                    <span className="h-[5px] w-[6px] rounded-[1px] bg-ink-3" />
                  </span>
                </div>
                <div className="relative min-h-0 flex-1">
                  <ScaledScreen width={MEMBER_SCREEN.width} height={MEMBER_SCREEN.height} defaultScale={0.399}>
                    <MemberEntryScreen />
                  </ScaledScreen>
                </div>
              </div>
            </Iphone16ProFrame>
          </div>
        </div>
      </div>

      <p className="sr-only">
        Illustration of the RIVET owner dashboard and the member app&rsquo;s entry QR, drawn from the product with demonstration values and no customer data.
      </p>
    </>
  );
}
