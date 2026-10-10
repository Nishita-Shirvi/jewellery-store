import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/** One layout for every order email, so they all look consistent. */
export interface OrderEmailProps {
  storeName: string;
  preview: string;
  heading: string;
  greetingName?: string | null;
  paragraphs: string[];
  items?: { name: string; quantity: number; amount: string }[];
  total?: string;
  button?: { label: string; url: string };
  footer: string;
}

export function OrderEmail(p: OrderEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{p.preview}</Preview>
      <Body
        style={{
          backgroundColor: "#f6f6f6",
          fontFamily: "Arial, Helvetica, sans-serif",
          color: "#222",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            maxWidth: 520,
            margin: "24px auto",
            padding: 28,
            borderRadius: 8,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
            {p.storeName.toUpperCase()}
          </Text>
          <Heading as="h1" style={{ fontSize: 20, margin: "20px 0 12px" }}>
            {p.heading}
          </Heading>
          {p.greetingName && <Text style={{ fontSize: 14 }}>Hi {p.greetingName},</Text>}
          {p.paragraphs.map((t, i) => (
            <Text key={i} style={{ fontSize: 14, lineHeight: "22px" }}>
              {t}
            </Text>
          ))}
          {p.items && p.items.length > 0 && (
            <Section style={{ margin: "12px 0" }}>
              {p.items.map((it, i) => (
                <Text key={i} style={{ fontSize: 14, margin: "4px 0" }}>
                  {it.name} × {it.quantity} — {it.amount}
                </Text>
              ))}
              {p.total && (
                <Text style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>
                  Total: {p.total}
                </Text>
              )}
            </Section>
          )}
          {p.button && (
            <Button
              href={p.button.url}
              style={{
                backgroundColor: "#262626",
                color: "#fff",
                padding: "10px 18px",
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              {p.button.label}
            </Button>
          )}
          <Hr style={{ margin: "24px 0", borderColor: "#eee" }} />
          <Text style={{ fontSize: 12, color: "#777" }}>{p.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
