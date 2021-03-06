import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Observable, empty} from 'rxjs';
import {environment} from '../../environments/environment';
import {FabricSettings, FabricSettingsList} from '../_model/fabric-settings';
import {User, UserList} from '../_model/user';
import {Fabric, FabricList} from '../_model/fabric';
import {EndpointList} from '../_model/endpoint';
import {QueueList} from '../_model/queue';
import {Version} from '../_model/version';


@Injectable({
    providedIn: 'root'
})

export class BackendService {
    baseUrl: any;
    domain: any;

    constructor(private http: HttpClient) {
        this.baseUrl = environment.api_entry;
    }

    getAppStatus(): Observable<any>{
        return this.http.get(this.baseUrl + '/app-status/');
    }

    getAppQueueLen(): Observable<any>{
        return this.http.get(this.baseUrl + '/app-status/queue');
    }

    getAppVersion(): Observable<Version> {
        return this.http.get<Version>(this.baseUrl + '/app-status/version');
    }

    getAppManagerStatus() {
        return this.http.get(this.baseUrl + '/app-status/manager');
    }

    getFabrics(sorts = []): Observable<FabricList> {
        if (sorts.length === 0) {
            return this.http.get<FabricList>(this.baseUrl + '/fabric');
        } else {
            const sortsStr = this.getSortsArrayAsString(sorts);
            return this.http.get<FabricList>(this.baseUrl + '/fabric?sort=' + sortsStr);
        }
    }

    getFabricsBrief(): Observable<FabricList> {
        return this.http.get<FabricList>(this.baseUrl + '/fabric?include=fabric');
    }

    getActiveMacAndIps(fabric: Fabric, addressType) {
        const filterString = 'and(eq("fabric","' + fabric.fabric + '"),eq("type","' + addressType + '"),or(eq("events.0.status","created"),eq("events.0.status","modified")))';
        return this.http.get(this.baseUrl + '/ept/endpoint?filter=' + filterString + '&count=1');
    }

    getFabricsOverviewTabData(fabricName, pageOffset, sorts, tab = 'endpoint', pageSize = 25): Observable<EndpointList> {
        if (sorts.length === 0) {
            return this.http.get<EndpointList>(this.baseUrl + '/ept/' + tab + '?filter=eq("fabric","' + fabricName + '")&sort=fabric&page-size=' + pageSize + '&page=' + pageOffset);
        } else {
            const sortsStr = this.getSortsArrayAsString(sorts);
            return this.http.get<EndpointList>(this.baseUrl + '/ept/' + tab + '?filter=eq("fabric","' + fabricName + '")&sort=' + sortsStr + '&page-size=' + pageSize + '&page=' + pageOffset);
        }
    }

    getEndpoints(fabricName, pageOffset, sorts, pageSize = 25): Observable<EndpointList> {
        if (sorts.length === 0) {
            return this.http.get<EndpointList>(this.baseUrl + '/ept/endpoint?filter=eq("fabric","' + fabricName + '")&sort=fabric&page-size=' + pageSize + '&page=' + pageOffset);
        } else {
            const sortsStr = this.getSortsArrayAsString(sorts);
            return this.http.get<EndpointList>(this.baseUrl + '/ept/endpoint?filter=eq("fabric","' + fabricName + '")&sort=' + sortsStr + '&page-size=' + pageSize + '&page=' + pageOffset);
        }
    }

    getFilteredEndpoints(fabricName, sorts = [], offsubnetFilter = false, staleFilter = false, activeFilter = false, rapidFilter = false, tab = 'endpoint', pageOffset = 0, pageSize = 25): Observable<EndpointList> {
        let conditions = '';
        const fabricFilter = 'eq("fabric","' + fabricName + '")';
        let count = 0;
        let sortsStr = '';
        if (offsubnetFilter) {
            conditions += ',eq("is_offsubnet",' + offsubnetFilter + ')';
            count++;
        }
        if (staleFilter) {
            conditions += ',eq("is_stale",' + staleFilter + ')';
            count++;
        }
        if (activeFilter) {
            conditions += ',or(eq("events.0.status","created"),eq("events.0.status","modified"))';
            count++;
        }
        if (rapidFilter) {
            conditions += ',eq("is_rapid",' + rapidFilter + ')';
            count++;
        }
        if (count > 1) {
            conditions = conditions.replace(',', '');
            conditions = 'and(' + fabricFilter + ',or(' + conditions + '))';
        } else if (count === 1) {
            conditions = 'and(' + fabricFilter + conditions + ')';
        } else {
            conditions = fabricFilter;
        }
        if (sorts.length > 0) {
            sortsStr = '&sort=' + this.getSortsArrayAsString(sorts);
        }
        let url = this.baseUrl + '/ept/' + tab + '?page-size=' + pageSize + '&page=' + pageOffset + '&filter=' + conditions + sortsStr;
        return this.http.get<EndpointList>(url);
    }

    getEndpoint(fabricName, vnid, address): Observable<EndpointList> {
        return this.http.get<EndpointList>(this.baseUrl + '/uni/fb-' + fabricName + '/endpoint/vnid-' + vnid + '/addr-' + address);
    }

    getMoveEventsForEndpoint(fabricName: string, vnid, address) {
        return this.http.get(this.baseUrl + `/ept/move?filter=and(eq("fabric","${fabricName}"),eq("vnid",${vnid}),eq("addr","${address}"))`);
    }

    getNodesForOffsubnetEndpoints(fabricName: string, vnid, address, tab): Observable<EndpointList> {
        return this.http.get<EndpointList>(this.baseUrl + '/ept/' + tab + '?filter=and(eq("fabric","' + fabricName + '"),eq("vnid",' + vnid + '),eq("addr","' + address + '"))&include=node');
    }

    getEndpointHistoryAllNodes(fabricName: string, vnid: number, address: string): Observable<EndpointList>{
        return this.http.get<EndpointList>(this.baseUrl + '/ept/history?filter=and(eq("fabric","' + fabricName + '"),eq("vnid",' + vnid + '),eq("addr","' + address + '"))');
    }

    getEndpointHistoryPerNode(fabricName: string, node, vnid, address): Observable<EndpointList> {
        return this.http.get<EndpointList>(this.baseUrl + '/uni/fb-' + fabricName + '/history/node-' + node + '/vnid-' + vnid + '/addr-' + address);
    }

    deleteEndpoint(fabricName: String, vnid, address) {
        return this.http.delete(this.baseUrl + '/uni/fb-' + fabricName + '/endpoint/vnid-' + vnid + '/addr-' + address + '/delete');
    }

    deleteAllEndpoints(fabricName: string, vnid = 0) {
        return this.http.request('DELETE', this.baseUrl + '/ept/endpoint/delete', {
            headers: new HttpHeaders({
                'Content-Type': 'application/json',
            }),
            body: {
                fabric: fabricName,
                vnid: vnid
            }
        });
    }

    login(username, password, token_required=false) {
        return this.http.post(this.baseUrl + '/user/login', {
            username: username,
            password: password,
            token_required: token_required
        });
    }

    logout() {
        return this.http.post(this.baseUrl + '/user/logout', {});
    }

    searchEndpoint(term:string="", fabric:string="") {
        let filter = ""
        term = term.trim()
        // do not perform query if search term is under minimum characters
        if(!term || term.length<=4){
            return empty();
        }
        if(term.substr(0,1)=="/"){
            filter='regex("addr","'+term.substr(1)+'")';
        } else {
            term = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
            filter='regex("addr","(?i)'+term+'")'
        }
        
        if(fabric.length>0){
            filter='and(eq("fabric","'+fabric+'"),'+filter+')';
        }       
        return this.http.get(this.baseUrl + '/ept/endpoint?filter='+filter+'&include=fabric,addr,vnid,type,first_learn&page-size=20&sort=addr');
    }

    getSortsArrayAsString(sorts) {
        let sortsStr = '';
        for (const sort of sorts) {
            sortsStr += sort.prop + '|' + sort.dir + ',';
        }
        sortsStr = sortsStr.slice(0, sortsStr.length - 1);
        return sortsStr;
    }

    startFabric(fabric: Fabric, reason = '') {
        return this.http.post(this.baseUrl + '/uni/fb-' + fabric.fabric + '/start', {reason: reason});
    }

    stopFabric(fabric: Fabric, reason = '') {
        return this.http.post(this.baseUrl + '/uni/fb-' + fabric.fabric + '/stop', {reason: reason});
    }

    verifyFabric(fabric: Fabric) {
        return this.http.post(this.baseUrl + '/uni/fb-' + fabric.fabric + '/verify', {});
    }

    buildController(fabric: Fabric){
        return this.http.post(this.baseUrl + '/uni/fb-' + fabric.fabric + '/controllers', {});
    }

    deleteFabric(fabric: Fabric) {
        return this.http.delete(this.baseUrl + '/uni/fb-' + fabric.fabric);
    }

    createFabric(fabric: Fabric) {
        return this.http.post(this.baseUrl + '/fabric', fabric.get_create_json());
    }

    updateFabricSettings(fabricSettings: FabricSettings) {
        const fabric = fabricSettings.fabric;
        return this.http.patch(this.baseUrl + '/uni/fb-' + fabric + '/settings-default', fabricSettings.get_save_json());
    }

    settingsReload(fabricSettings: FabricSettings){
        const fabric = fabricSettings.fabric;
        return this.http.post(this.baseUrl + '/uni/fb-' + fabric + '/settings-default/reload', {})
    }

    updateFabric(fabric: Fabric) {
        return this.http.patch(this.baseUrl + '/uni/fb-' + fabric.fabric, fabric.get_save_json());
    }


    getFabricSettings(fabricName: string, settings) {
        return this.http.get<FabricSettingsList>(this.baseUrl + '/uni/fb-' + fabricName + '/settings-' + settings);
    }

    getFabricByName(fabricName: string): Observable<FabricList> {
        return this.http.get<FabricList>(this.baseUrl + '/uni/fb-' + fabricName);
    }

    getFabricStatus(fabric: Fabric) {
        return this.http.get(this.baseUrl + '/uni/fb-' + fabric.fabric + '/status');
    }

    createUser(user: User): Observable<any> {
        return this.http.post(this.baseUrl + '/user', user.get_save_json());
    }

    updateUser(user: User): Observable<any> {
        return this.http.patch(this.baseUrl + '/uni/username-' + user.username, user.get_save_json());
    }

    deleteUser(user: User): Observable<any> {
        return this.http.delete(this.baseUrl + '/uni/username-' + user.username);
    }

    getUsers(): Observable<UserList> {
        const options = {
            params: new HttpParams().set('sort', 'username|asc')
        };
        return this.http.get<UserList>(this.baseUrl + '/user', options);
    }

    getUserDetails(username: string) {
        const url = this.baseUrl + '/uni/username-' + username;
        return this.http.get(url);
    }

    getQueues(pageOffset: number, pageSize: number=10, sorts: any={}, term: string=""): Observable<QueueList> {
        let url = this.baseUrl + '/ept/queue?include=dn,proc,queue,start_timestamp,total_rx_msg,total_tx_msg&page-size='+pageSize+'&page=' + pageOffset;
        if(sorts.length > 0){
            url+= '&sort='+this.getSortsArrayAsString(sorts);
        }
        if(term.length > 0){
            term = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
            url+= '&filter=or(regex("proc","(?i)'+term+'"), regex("queue","(?i)'+term+'"))';
        }
        return this.http.get<QueueList>(url)
    }

    getQueue(proc: string, queue: string): Observable<QueueList> {
        return this.http.get<QueueList>(this.baseUrl + '/uni/proc-'+proc+'/queue-'+queue);
    }

    getPerNodeHistory(fabric, node, vnid, address) {
        return this.http.get(this.baseUrl + '/uni/fb-' + fabric + '/history/node-' + node + '/vnid-' + vnid + '/addr-' + address);
    }

    getCurrentlyOffsubnetNodes(fabric, vnid, address){
        return this.http.get(this.baseUrl + '/ept/history' + 
            '?include=node&filter=and(eq("is_offsubnet",true),eq("fabric","' + fabric + '"),eq("vnid",' + vnid + '),eq("addr","' + address + '"))');
    }

    getCurrentlyStaleNodes(fabric, vnid, address){
        return this.http.get(this.baseUrl + '/ept/history' + 
            '?include=node&filter=and(eq("is_stale",true),eq("fabric","' + fabric + '"),eq("vnid",' + vnid + '),eq("addr","' + address + '"))');
    }

    testNotification(fabricName: String, type: String) {
        return this.http.post(this.baseUrl + '/uni/fb-' + fabricName + '/settings-default/test/' + type, {});
    }

    dataplaneRefresh(fabricName: String, vnid: number, address: String) {
        return this.http.post(this.baseUrl + '/uni/fb-' + fabricName + '/endpoint/vnid-' + vnid + '/addr-' + address + '/refresh', {});
    }

    getRapidEndpoints(fabricName: String, vnid: number, address: String): Observable<EndpointList> {
        return this.http.get<EndpointList>(this.baseUrl +
            `/ept/rapid?filter=and(eq("fabric","${fabricName}"),eq("vnid",${vnid}),eq("addr","${address}"))`)
    }

    getClearedEndpoints(fabricName: String, vnid: number, address: String): Observable<EndpointList> {
        return this.http.get<EndpointList>(this.baseUrl +
            `/ept/remediate?filter=and(eq("fabric","${fabricName}"),eq("vnid",${vnid}),eq("addr","${address}"))`)
    }

    getOffSubnetEndpoints(fabric: String, vnid: number, address: String): Observable<EndpointList> {
        return this.http.get<EndpointList>(this.baseUrl +
            `/ept/offsubnet?filter=and(eq("fabric","${fabric}"),eq("vnid",${vnid}),eq("addr","${address}"))`);
    }

    getStaleEndpoints(fabric: String, vnid: number, address: String): Observable<EndpointList> {
        return this.http.get<EndpointList>(this.baseUrl +
            `/ept/stale?filter=and(eq("fabric","${fabric}"),eq("vnid",${vnid}),eq("addr","${address}"))`);
    }

    clearEndpoint(fabric: String, vnid: number, addr: String, nodes: Array<Number>) {
        return this.http.post(this.baseUrl + `/uni/fb-${fabric}/endpoint/vnid-${vnid}/addr-${addr}/clear`, {"nodes":nodes});
    }

    getCountsForEndpointDetails(fabric, vnid, address, table): Observable<EndpointList> {
        return this.http.get<EndpointList>(this.baseUrl + 
            `/ept/${table}?include=count&filter=and(eq("fabric","${fabric}"),eq("vnid",${vnid}),eq("addr","${address}"))`);
    }

    getActiveXrNodes(fabric: String, vnid: number, address: String): Observable<EndpointList> {
        return this.http.get<EndpointList>(this.baseUrl + 
            `/ept/history?include=node&filter=and(eq("fabric","${fabric}"),eq("vnid",${vnid}),eq("addr","${address}"),or(eq("events.0.status","created"),eq("events.0.status","modified")),gt("events.0.remote",0))`);
    }
}
