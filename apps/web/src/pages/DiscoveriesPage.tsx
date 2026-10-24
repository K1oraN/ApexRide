import { ScanSearch } from 'lucide-react';
import { PageHeader } from '../components/design-system';
import { CommunityDiscovery } from '../similarity/CommunityDiscovery';

export function DiscoveriesPage() {
  return (
    <div className="guide-page">
      <PageHeader
        title="DESCOBERTAS"
        description="Consulte trajetos por região."
        action={<ScanSearch aria-hidden />}
      />
      <CommunityDiscovery />
    </div>
  );
}
