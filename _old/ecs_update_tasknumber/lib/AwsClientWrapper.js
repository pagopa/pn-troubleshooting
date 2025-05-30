
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { ECSClient, ListServicesCommand, ListClustersCommand, UpdateServiceCommand} = require("@aws-sdk/client-ecs"); 
const { ApplicationAutoScalingClient, RegisterScalableTargetCommand } = require("@aws-sdk/client-application-auto-scaling");

function awsClientCfg( profile ) {
  const self = this;
  //if(!profileName){
    return { 
      region: "eu-south-1", 
      credentials: fromIni({ 
        profile: profile,
      })
    }
  //}
}

class AwsClientsWrapper {

  constructor( profile, profileName, roleArn ) {
    this.ecsClient = new ECSClient( awsClientCfg( profile, profileName, roleArn ))
    this.autoScalingClient = new ApplicationAutoScalingClient( awsClientCfg( profile, profileName, roleArn ));
  }

  async init() {
    console.log("Configuring aws client...")
  }

  async _listClusters() {
    const command = new ListClustersCommand();
    const response = await this.ecsClient.send(command);
    return response
  }

  async _listServices(cluster) {
    const input = { // ListTasksRequest
      cluster: cluster,
      maxResults: 40,
    };
    const command = new ListServicesCommand(input);
    const response = await this.ecsClient.send(command);
    return response
  }

  async _registerScalableTarget(resourceId, min, max) {
    const input = { // RegisterScalableTargetRequest
      ServiceNamespace: "ecs", // required
      ResourceId: resourceId, // required
      ScalableDimension: "ecs:service:DesiredCount", // required
      MinCapacity: min,
      MaxCapacity: max
    };
    const command = new RegisterScalableTargetCommand(input);
    const response = await this.autoScalingClient.send(command);
    return response
  }

  async _updateService(cluster, desired, resourceId, task) {
    const input = { // RegisterScalableTargetRequest
      cluster: cluster,
      service: resourceId, // required
      desiredCount: desired,
      taskDefinition: task,
    };
    const command = new UpdateServiceCommand(input);
    const response = await this.ecsClient.send(command);
    return response
  }
}
exports.AwsClientsWrapper = AwsClientsWrapper;

