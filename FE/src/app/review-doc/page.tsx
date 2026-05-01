import ReviewWorkspace from "@/components/review/ReviewWorkspace";
import GuardedReviewDocPage from "./review-doc-guard";

export default function ReviewDocPage() {
  return (
    <GuardedReviewDocPage>
      <ReviewWorkspace />
    </GuardedReviewDocPage>
  );
}
