/**
 * Warm, slightly dark wash for a section background.
 *
 * SURFACE is exported so anything fading into this section can end on
 * exactly the same colour. Fading to white and then starting a tinted
 * section is what produces a visible seam.
 *
 * Layering: no negative z-index. A `relative` parent with no z-index
 * doesn't create a stacking context, so a -z-10 child escapes it and
 * hides behind the page background. Content above this needs
 * `relative z-10`.
 *
 * Usage:
 *   <section className="relative overflow-hidden">
 *     <GradientBackdrop />
 *     <div className="relative z-10"> … </div>
 *   </section>
 */

// The colour at the very top of the backdrop. Anything fading into a
// section that uses this component should end here.
export const SURFACE = "#efeae0";

export default function GradientBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Base. Warm mid-tone rather than white — this is what carries
          the "slightly dark" feel without going murky. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, #efeae0 0%, #f4eede 35%, #eae5da 72%, #e4dfd4 100%)",
        }}
      />

      {/* Gold light from the upper left. */}
      <div className="absolute -top-40 -left-32 w-[620px] h-[620px] rounded-full bg-gold/30 blur-[130px]" />

      {/* Dark mass low on the right. Without something cool and dark in
          the mix, the whole thing reads as flat yellow. */}
      <div className="absolute bottom-[-240px] right-[-160px] w-[620px] h-[620px] rounded-full bg-ink/20 blur-[150px]" />

      {/* A second, smaller dark pool on the left, low down. */}
      <div className="absolute bottom-[-120px] left-[10%] w-[380px] h-[380px] rounded-full bg-ink/12 blur-[130px]" />

      {/* Off-centre gold hot spot, so the light isn't perfectly even.
          Real light never is. */}
      <div className="absolute top-1/3 right-1/4 w-[380px] h-[380px] rounded-full bg-gold/25 blur-[120px]" />

      {/* Grounding shadow along the bottom edge. */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-ink/10 to-transparent" />
    </div>
  );
}
