import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePermissionPage } from "@/lib/auth-guards";
import { listCannedReplies, listFaqsAdmin } from "@/services/support.service";
import {
  deleteCannedReplyAction,
  deleteFaqAction,
  saveCannedReplyAction,
  saveFaqAction,
} from "../actions";

export const dynamic = "force-dynamic";

const area =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

function FaqFields({
  faq,
}: {
  faq?: {
    id: string;
    question: string;
    answer: string;
    category: string;
    position: number;
    isPublished: boolean;
  };
}) {
  return (
    <>
      {faq && <input type="hidden" name="faqId" value={faq.id} />}
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_5rem]">
        <Input
          name="question"
          defaultValue={faq?.question}
          placeholder="Question"
          aria-label="Question"
          required
        />
        <Input name="category" defaultValue={faq?.category ?? "General"} aria-label="Category" />
        <Input
          name="position"
          type="number"
          min={0}
          defaultValue={faq?.position ?? 0}
          aria-label="Order"
        />
      </div>
      <textarea
        name="answer"
        rows={3}
        defaultValue={faq?.answer}
        placeholder="Answer"
        aria-label="Answer"
        className={area}
        required
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" defaultChecked={faq?.isPublished ?? true} /> Show
        in the help centre
      </label>
    </>
  );
}

export default async function AdminFaqsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermissionPage("faqs.manage", "/admin/faqs");
  const { error } = await searchParams;
  const [faqs, canned] = await Promise.all([listFaqsAdmin(), listCannedReplies()]);

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">FAQs and saved replies</h1>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error.slice(0, 200)}
        </p>
      )}

      <section aria-labelledby="faq-h" className="space-y-4">
        <h2 id="faq-h" className="text-lg font-medium">
          Help-centre questions
        </h2>
        <form
          action={saveFaqAction}
          className="border-border space-y-2 rounded-md border p-4"
          aria-label="New FAQ"
        >
          <FaqFields />
          <Button type="submit" size="sm">
            Add question
          </Button>
        </form>
        {faqs.map((f) => (
          <div
            key={f.id}
            className="border-border space-y-2 rounded-md border p-4"
            data-testid="admin-faq"
          >
            <form
              action={saveFaqAction}
              className="space-y-2"
              aria-label={`Edit FAQ ${f.question}`}
            >
              <FaqFields faq={f} />
              <Button type="submit" size="sm" variant="outline">
                Save
              </Button>
            </form>
            <form action={deleteFaqAction}>
              <input type="hidden" name="faqId" value={f.id} />
              <Button type="submit" size="sm" variant="ghost">
                Delete
              </Button>
            </form>
          </div>
        ))}
      </section>

      <section aria-labelledby="canned-h" className="space-y-4">
        <h2 id="canned-h" className="text-lg font-medium">
          Saved replies (for support staff)
        </h2>
        <form
          action={saveCannedReplyAction}
          className="border-border space-y-2 rounded-md border p-4"
          aria-label="New saved reply"
        >
          <Input
            name="title"
            placeholder="Title, e.g. Delivery times"
            aria-label="Title"
            required
          />
          <textarea
            name="cannedBody"
            rows={3}
            placeholder="Reply text"
            aria-label="Reply text"
            className={area}
            required
          />
          <Button type="submit" size="sm">
            Add saved reply
          </Button>
        </form>
        {canned.map((c) => (
          <div
            key={c.id}
            className="border-border flex flex-wrap items-start justify-between gap-2 rounded-md border p-4 text-sm"
          >
            <form
              action={saveCannedReplyAction}
              className="flex-1 space-y-2"
              aria-label={`Edit saved reply ${c.title}`}
            >
              <input type="hidden" name="cannedId" value={c.id} />
              <Input name="title" defaultValue={c.title} aria-label="Title" />
              <textarea
                name="cannedBody"
                rows={3}
                defaultValue={c.body}
                aria-label="Reply text"
                className={area}
              />
              <Button type="submit" size="sm" variant="outline">
                Save
              </Button>
            </form>
            <form action={deleteCannedReplyAction}>
              <input type="hidden" name="cannedId" value={c.id} />
              <Button type="submit" size="sm" variant="ghost">
                Delete
              </Button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
